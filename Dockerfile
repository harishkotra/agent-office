# Ciudadan AgentOffice — reproducible production image.
# Single process: Colyseus + REST + compiled UI (no Ollama, no Redis).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json ./
COPY packages packages
COPY tsconfig.base.json ./
RUN npm install --workspaces --if-present \
    && npm run build --workspace=@agent-office/core \
    && npm run build --workspace=@agent-office/adapters \
    && npm run build --workspace=@agent-office/ui \
    && npm run build --workspace=@agent-office/server

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core/dist ./packages/core/dist
COPY --from=build /app/packages/core/package.json ./packages/core/
COPY --from=build /app/packages/adapters/dist ./packages/adapters/dist
COPY --from=build /app/packages/adapters/package.json ./packages/adapters/
COPY --from=build /app/packages/server/dist ./packages/server/dist
COPY --from=build /app/packages/server/package.json ./packages/server/
COPY --from=build /app/packages/ui/dist ./packages/ui/dist
COPY --from=build /app/packages/ui/package.json ./packages/ui/
WORKDIR /app/packages/server
ENV PORT=3000 HOST=127.0.0.1
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
