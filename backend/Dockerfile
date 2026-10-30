# ==============================================================================
# LabelFlow Backend Dockerfile (Production Python 3.11 Slim)
# ==============================================================================
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies needed for PyMuPDF, cryptography, etc.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libmupdf-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY . .

# Ensure storage directory exists with write permissions
RUN mkdir -p storage/jobs storage/temp && chmod -R 777 storage

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
