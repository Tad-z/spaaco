# syntax=docker/dockerfile:1

# ---- build -----------------------------------------------------------------
# The build stage carries the whole toolchain — TypeScript, the test runner,
# every dev dependency — and none of it reaches the image that runs in
# production. That is the point of the split: a smaller image is a smaller
# attack surface, and `tsc` has no business being on a public host.
FROM node:24-alpine AS build

WORKDIR /app

# Copied before the source so a change to application code does not invalidate
# the dependency layer. `npm ci` installs exactly the lockfile, never a
# resolved-at-build-time version.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
# The operational scripts compile too: applying indexes, creating the first
# administrator and loading the launch content are all things an operator does
# inside the running image, and none is reachable over HTTP.
COPY scripts ./scripts

RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM node:24-alpine AS runtime

# Alpine ships a `node` user (uid 1000). Running as root in a container is the
# difference between a compromised process and a compromised host namespace.
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./

# `--omit=dev` leaves out TypeScript, Vitest, ESLint and the rest; `--ignore-scripts`
# stops a transitive dependency's postinstall running on the production host.
#
# Safe for the two native dependencies here, which is worth checking rather
# than assuming: sharp 0.35 ships its binaries as optional dependencies that
# npm resolves by platform, and argon2 loads its prebuild through
# `node-gyp-build` at require time rather than linking it during install. Both
# ship a musl build, which is what alpine needs.
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build /app/dist ./dist

# The launch loader reads the firm's transcribed website copy from here,
# resolved relative to its own compiled location.
COPY fixtures/seed ./dist/fixtures/seed

# Only the upload directories need to be writable by the runtime user. Leaving
# `dist` and `node_modules` root-owned means a compromised process cannot
# rewrite the code it is running.
RUN mkdir -p /app/.uploads /app/.private-uploads \
  && chown node:node /app/.uploads /app/.private-uploads

USER node

EXPOSE 4000

# The platform's own health check hits this; it needs no database, so a slow
# Atlas connection does not read as a dead container.
#
# `PORT` is read rather than hardcoded: a deployment that sets it would
# otherwise get a healthy container reporting unhealthy for ever.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const p=process.env.PORT||4000;fetch('http://127.0.0.1:'+p+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# No npm in the entrypoint: it would sit between the platform and the process
# as PID 1 and swallow SIGTERM, so the graceful shutdown in server.ts would
# never run and in-flight requests would be cut off.
CMD ["node", "dist/src/server.js"]
