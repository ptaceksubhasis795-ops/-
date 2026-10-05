FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY src ./src
COPY prisma ./prisma
RUN npx prisma generate --schema prisma/schema.prisma
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy --schema prisma/schema.prisma && if [ \"$PRISMA_SEED_ON_BOOT\" = \"true\" ]; then npx prisma db seed; fi && node dist/main.js"]
