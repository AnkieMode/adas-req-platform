# ADAS 需求管理平台（多阶段构建）
# 构建: docker build -t adas-req-platform .
FROM node:20 AS client-build
WORKDIR /build
COPY client/package*.json ./client/
RUN cd client && npm install
COPY client ./client
RUN cd client && npm run build

FROM node:20
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install
COPY server/src ./server/src
COPY server/scripts ./server/scripts
COPY --from=client-build /build/client/dist ./client/dist
RUN mkdir -p /app/data
ENV PORT=3002
ENV DATA_DIR=/app/data
ENV NODE_ENV=production
EXPOSE 3002
WORKDIR /app/server
CMD ["node", "src/index.js"]
