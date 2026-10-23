"""FastAPI app factory: health check, error format, CORS and request logging."""
import logging
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .errors import install_error_handlers
from .logging import setup_logging
from .models import Health


def create_app(service_name: str, description: str, lifespan=None) -> FastAPI:
    settings = get_settings()
    logger = setup_logging(service_name, settings.log_level)
    app = FastAPI(title=f"Horizon Travel {service_name}", description=description, version="1.0.0", lifespan=lifespan)
    install_error_handlers(app)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        start = time.perf_counter()
        response = await call_next(request)
        if request.url.path != "/health":
            logger.info(
                "request",
                extra={"extra_fields": {
                    "requestId": request_id, "method": request.method, "path": request.url.path,
                    "status": response.status_code, "ms": round((time.perf_counter() - start) * 1000, 1),
                }},
            )
        response.headers["x-request-id"] = request_id
        return response

    @app.get("/health", response_model=Health, tags=["health"], summary="Load balancer health check")
    def health() -> Health:
        return Health()

    return app
