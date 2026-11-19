FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node public ./public
COPY --chown=node:node package.json server.js ./
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV PORT=3000
EXPOSE 3000
CMD ["node","server.js"]
