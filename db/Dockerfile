# One off migration task. Locally it runs before the services start;
# in AWS it runs as a one off ECS task before each deployment.
FROM python:3.12-slim
RUN pip install --no-cache-dir "psycopg[binary]==3.2.3"
WORKDIR /db
COPY migrate.py .
COPY migrations ./migrations
CMD ["python", "migrate.py"]
