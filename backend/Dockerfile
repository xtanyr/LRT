FROM node:22-alpine AS build
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --ignore-scripts --workspaces=false
COPY backend ./
RUN rm -f tsconfig.tsbuildinfo && npx prisma generate && npm run build \
    && npm prune --omit=dev --ignore-scripts --workspaces=false

FROM node:22-alpine
WORKDIR /app/backend
ENV NODE_ENV=production
COPY --from=build /app/backend/package.json /app/backend/package-lock.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
COPY backend/test/uat-seed-smoke.cjs ./test/uat-seed-smoke.cjs
COPY backend/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
