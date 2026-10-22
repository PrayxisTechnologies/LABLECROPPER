# LabelFlow High-Performance Backend Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Ensure standard tools are installed
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies first for Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Cloud platforms like Render/Railway pass dynamic $PORT variable
ENV PORT=8000
EXPOSE 8000

# Start Uvicorn ASGI server bound to 0.0.0.0 and dynamic PORT with extended timeouts
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --timeout-keep-alive 75"]
