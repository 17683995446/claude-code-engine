FROM oven/bun:1.2.14-slim

WORKDIR /app

# 安装依赖（利用 Docker 层缓存）
COPY package.json bun.lock ./
RUN bun install --production

# 复制源代码
COPY src ./src
COPY tsconfig.json ./

# 环境变量
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# 暴露端口
EXPOSE 3000

# 健康检查（使用 /health/live 端点，无需鉴权）
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:' + (process.env.PORT || '3000') + '/health/live').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# 创建非 root 用户并切换
RUN addgroup --system --gid 1001 bunapp && \
    adduser --system --uid 1001 --gid 1001 bunapp
USER bunapp

# 入口：HTTP 服务模式
CMD ["bun", "run", "src/main.ts"]
