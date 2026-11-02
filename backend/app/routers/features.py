from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import mapping, shape
from shapely.validation import explain_validity
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Feature
from ..schemas import FeatureCollectionOut, FeatureIn, FeatureOut

router = APIRouter(prefix="/features", tags=["features"])

GeomType = Literal["Point", "LineString", "Polygon"]


def to_geojson(row: Feature) -> dict:
    return {
        "type": "Feature",
        "id": row.id,
        "geometry": mapping(to_shape(row.geom)),
        "properties": {
            **(row.properties or {}),
            "name": row.name,
            "geom_type": row.geom_type,
            "created_at": row.created_at.isoformat(),
            "updated_at": row.updated_at.isoformat(),
        },
    }


def parse_input(body: FeatureIn) -> tuple[str, str, object, dict]:
    """แปลง GeoJSON เป็นค่าที่เก็บลง DB พร้อมตรวจรูปทรง"""
    geom = shape(body.geometry.model_dump())
    if not geom.is_valid:
        raise HTTPException(422, f"Invalid geometry: {explain_validity(geom)}")
    props = dict(body.properties or {})
    name = str(props.pop("name", "") or body.geometry.type)
    # ฟิลด์ที่ระบบสร้างเอง ไม่ให้ client เขียนทับ
    for key in ("geom_type", "created_at", "updated_at"):
        props.pop(key, None)
    return name, body.geometry.type, from_shape(geom, srid=4326), props


def get_or_404(db: Session, feature_id: int) -> Feature:
    row = db.get(Feature, feature_id)
    if row is None:
        raise HTTPException(404, "Feature not found")
    return row


@router.get("", response_model=FeatureCollectionOut)
def list_features(type: GeomType | None = None, db: Session = Depends(get_db)):
    stmt = select(Feature).order_by(Feature.created_at)
    if type:
        stmt = stmt.where(Feature.geom_type == type)
    rows = db.scalars(stmt).all()
    return {"type": "FeatureCollection", "features": [to_geojson(r) for r in rows]}


@router.get("/{feature_id}", response_model=FeatureOut)
def get_feature(feature_id: int, db: Session = Depends(get_db)):
    return to_geojson(get_or_404(db, feature_id))


@router.post("", response_model=FeatureOut, status_code=201)
def create_feature(body: FeatureIn, db: Session = Depends(get_db)):
    name, geom_type, geom, props = parse_input(body)
    row = Feature(name=name, geom_type=geom_type, geom=geom, properties=props)
    db.add(row)
    db.commit()
    db.refresh(row)
    return to_geojson(row)


@router.put("/{feature_id}", response_model=FeatureOut)
def update_feature(feature_id: int, body: FeatureIn, db: Session = Depends(get_db)):
    row = get_or_404(db, feature_id)
    row.name, row.geom_type, row.geom, row.properties = parse_input(body)
    db.commit()
    db.refresh(row)
    return to_geojson(row)


@router.delete("/{feature_id}", status_code=204)
def delete_feature(feature_id: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, feature_id))
    db.commit()
    return Response(status_code=204)
