# Use Python 3.10 (The stable version for AI)
FROM python:3.10-slim

# 1. Install System Dependencies
# - libgl1: Required for OpenCV
# - ffmpeg: Required for Audio processing
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 2. Set working directory
WORKDIR /app

# 3. Copy dependencies first (Caching layer)
COPY requirements.txt .

# 4. Install Python Libraries
# We use --no-cache-dir to keep the image small
RUN pip install --default-timeout=1000 --no-cache-dir -r requirements.txt


# 5. Copy the rest of the backend code
COPY . .

# 6. Command to run the app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]