# Keep in sync with .node-version
FROM node:26-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --cache /tmp/npm-cache && rm -rf /tmp/npm-cache

# Only the static site is served; nothing else from the repository goes into the image.
COPY index.html app.css ./site/
COPY src ./site/src

USER node
EXPOSE 3000
CMD ["./node_modules/.bin/http-server", "site", "--port", "3000", "-c-1", "-d", "false"]
