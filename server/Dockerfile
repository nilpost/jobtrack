# SQLite comes from node:sqlite, Node's built-in driver — so there is no
# native module to compile and no build stage. Alpine is safe here for the
# same reason (no glibc-linked binaries to worry about).
FROM node:22-alpine

WORKDIR /app

# Dependencies first so a source-only change doesn't reinstall them.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src

# The SQLite file lives here. Mount a volume over it — otherwise the
# container's writable layer holds every application you have ever tracked,
# and removing the container deletes them.
VOLUME ["/data"]
ENV JOBTRACK_DB_PATH=/data/jobtrack.sqlite

EXPOSE 8787

# Drop privileges. The node image ships a `node` user; /data must be owned by
# it or the first write fails.
RUN mkdir -p /data && chown -R node:node /data
USER node

# Node 22 needs the flag to run TypeScript directly; it becomes the default
# in 23.6+. Running the sources avoids shipping a build step for ~600 lines.
CMD ["node", "--experimental-strip-types", "src/index.ts"]
