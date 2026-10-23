# Build context is the services/ folder:  docker build -f document-service/Dockerfile -t horizon/document-service services
# Stage 1: install dependencies into a virtualenv
FROM python:3.12-slim AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"
COPY common /src/common
RUN pip install /src/common
COPY document-service/requirements.txt /src/requirements.txt
RUN pip install -r /src/requirements.txt

# Stage 2: slim runtime with only the virtualenv and the app code, running as a non root user
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH="/venv/bin:$PATH" SERVICE_NAME=document-service
RUN useradd --create-home --uid 10001 app
COPY --from=build /venv /venv
WORKDIR /app
COPY document-service/app ./app
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=2)"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--forwarded-allow-ips", "*"]
