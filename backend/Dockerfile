# FinalSaaS backend — FastAPI (Python 3.12)
# Single process on purpose: the follow-up/callback dispatcher and the batch
# dialler run IN-PROCESS (asyncio tasks started by the app lifespan).
# Running uvicorn with --workers > 1 would start one dispatcher per worker
# and cause duplicate outbound calls, so workers MUST stay at 1.
# Scale by running one backend replica (see docs/PRODUCTION.md).

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps needed by wheels that are not fully self-contained
# (audio processing / cryptography fallbacks). Kept minimal.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first (better layer caching)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code + migrations
COPY app ./app
COPY alembic ./alembic

# Runtime data: SQLite DB, recordings, transcripts (mounted as a volume
# in docker-compose so it survives container rebuilds)
RUN mkdir -p /app/data/recordings /app/data/transcripts

# Non-root runtime user
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# workers=1 — see header comment. Do not add --workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
