FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml README.md /app/
COPY alembic.ini /app/alembic.ini
COPY migrations /app/migrations
COPY src /app/src
COPY config /app/config
# Render presets load their fonts from here (config/presets.json fonts_dir).
COPY apps/web/public/visualizer/fonts /app/apps/web/public/visualizer/fonts
COPY data /app/data
COPY run_pipeline.py /app/

RUN python -m pip install --upgrade pip \
    && python -m pip install .
