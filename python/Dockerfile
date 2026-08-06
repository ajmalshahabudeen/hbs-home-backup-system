# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/python \
    STORAGE_ROOT=/data/storage

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data/storage/users \
  && chmod -R 777 /data/storage

COPY python/requirements.txt /app/python/requirements.txt
RUN pip install --no-cache-dir -r /app/python/requirements.txt

COPY python /app/python
RUN chmod +x /app/python/worker-entrypoint.sh /app/python/beat-entrypoint.sh /app/python/enqueue_job.py \
  && sed -i 's/\r$//' /app/python/worker-entrypoint.sh /app/python/beat-entrypoint.sh

VOLUME ["/data/storage"]
WORKDIR /app/python
ENTRYPOINT ["/bin/bash", "/app/python/worker-entrypoint.sh"]
