from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.database import init_db
from app.api import auth, projects, environments, secrets, audit, members, share, ssh_credentials

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Secure multi-cloud .env file manager with encryption, RBAC, and audit logging",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(environments.router, prefix="/api/v1")
app.include_router(secrets.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(members.router, prefix="/api/v1")
app.include_router(share.router, prefix="/api/v1")
app.include_router(ssh_credentials.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.app_version}
