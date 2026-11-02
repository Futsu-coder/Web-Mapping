from typing import Annotated, Any, Union

from geojson_pydantic import Feature, FeatureCollection, LineString, Point, Polygon
from pydantic import Field

# รับเฉพาะ 3 ชนิดตามโจทย์ ชนิดอื่นจะได้ 422 อัตโนมัติ
Geometry = Annotated[Union[Point, LineString, Polygon], Field(discriminator="type")]

# ขาเข้า: GeoJSON Feature, ชื่อเก็บใน properties.name
FeatureIn = Feature[Geometry, dict[str, Any]]

# ขาออก: Feature มี id และ properties (name, created_at, ...)
FeatureOut = Feature[Geometry, dict[str, Any]]
FeatureCollectionOut = FeatureCollection[FeatureOut]
