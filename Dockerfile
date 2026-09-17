FROM node:24-bookworm-slim AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production \
    PORT=7860 \
    ANALYSIS_PROVIDER=local \
    ML_SERVICE_URL=http://127.0.0.1:8000 \
    DATA_DIR=/app/data \
    CLARIFYMED_ARTIFACT_DIR=/app/ml/artifacts \
    MODEL_CACHE_DIR=/home/node/.cache/clarifymed \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY ml_service/requirements.txt ./ml_service/requirements.txt
RUN pip3 install --break-system-packages -r ml_service/requirements.txt
COPY server ./server
COPY ml_service ./ml_service
COPY ml ./ml
COPY deploy/healthcheck.mjs ./deploy/healthcheck.mjs
COPY --from=web-build /app/dist ./dist
RUN mkdir -p /app/data /app/ml/artifacts /home/node/.cache/clarifymed /home/node/.EasyOCR && chown -R node:node /app /home/node/.cache /home/node/.EasyOCR
USER node
EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 CMD ["node", "deploy/healthcheck.mjs"]
CMD ["npm", "run", "start:container"]
