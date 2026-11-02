import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import features

app = FastAPI(title="Web Mapping API", description="CRUD ข้อมูลเชิงพื้นที่ในรูปแบบ GeoJSON")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(features.router)


@app.get("/health")
def health():
    return {"status": "ok"}
