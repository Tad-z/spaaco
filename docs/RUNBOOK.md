# Runbook

Operational procedures for the SPA Ajibade & Co. website API. Written for
whoever is on the other end of a problem at an awkward hour, so each procedure
is a sequence you can follow without having read the codebase.

Terms used throughout: **the API** is this service; **the dashboard** is the
separate admin frontend; **the site** is the public frontend. All three are
deployed independently.

---

## 1. What this service is, in one paragraph

An Express API on MongoDB. It serves the firm's public website content, gives
the dashboard an authenticated admin API, and receives three forms — mandate
enquiries, messages, and job applications with a CV upload. It stores personal
data, which is why several procedures below are stricter than they would
otherwise be. It is stateless apart from an in-process cache, so it scales
horizontally and any instance can be replaced at any time.

---

## 2. Before the first deploy

### 2.1 Things the firm must provide

The API will not start in production without these. Gather them first.

| What                  | Where it goes                                         | Notes                                                             |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| MongoDB Atlas cluster | `MONGODB_URI`                                         | A dedicated database, not shared with another product.            |
| Cloudinary account    | `CLOUDINARY_URL`                                      | Serves every image on the site.                                   |
| S3 bucket (private)   | `S3_*`                                                | CVs only. Must not be public — see 2.3.                           |
| Resend account        | `RESEND_API_KEY`, `MAIL_FROM`                         | Acknowledgements and notifications.                               |
| Cloudflare Turnstile  | `TURNSTILE_SECRET_KEY`                                | Optional — see 2.4. The honeypot and rate limit apply regardless. |
| A ClamAV endpoint     | `CLAMAV_HOST`, `CLAMAV_PORT`                          | Optional — see 2.4. Needs a second always-on service.             |
| Firm mailboxes        | `NOTIFY_ENQUIRIES_TO`, `NOTIFY_APPLICATIONS_TO`       | Where "a new enquiry arrived" goes.                               |
| Frontend URLs         | `CORS_ORIGINS`, `ADMIN_DASHBOARD_URL`, `API_BASE_URL` | Exact origins, comma-separated for CORS.                          |

### 2.2 Secrets to generate

Three, none of which may be a placeholder in production — the API refuses to
start if `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY` or `IP_HASH_SALT` still holds the
value from `.env.example`.

```bash
# JWT_ACCESS_SECRET — any long random string
openssl rand -base64 48

# ENCRYPTION_KEY — exactly 64 hex characters (32 bytes). Signs local CV links.
openssl rand -hex 32

# IP_HASH_SALT — any long random string
openssl rand -base64 32

# FRONTEND_REVALIDATE_SECRET — must match the value the site expects
openssl rand -base64 32
```

Store them in the platform's secret manager, never in the repository, never in
a build argument, and never in a `.env` file inside the image.

**`ENCRYPTION_KEY`** signs the local CV download links. Rotating it invalidates
any link already issued, which is harmless — they last five minutes.

### 2.3 The CV bucket

CVs are the most sensitive thing this API holds. The bucket must:

- block all public access at the bucket level,
- have no bucket policy granting `s3:GetObject` to `*`,
- have versioning **off**, or a lifecycle rule expiring non-current versions —
  otherwise the retention sweep deletes the current object and leaves the CV
  readable in an earlier version,
- have a lifecycle rule as a backstop for the retention period, in case the
  sweep ever stops running.

The API only ever issues five-minute presigned links, so nothing else needs
read access.

### 2.4 The two optional protections

Both defend the public forms, and both cost money or a second service, so both
are opt-outs rather than requirements. Neither is on by default.

**Malware scanning (`VIRUS_SCAN_DRIVER`).** With `clamav`, every CV is scanned
before it is stored, and an infected one is refused with a 422. With `noop`,
nothing is scanned and the dashboard still shows HR a CV as clean — so the API
**refuses to start in production** unless you also set
`ALLOW_UNSCANNED_UPLOADS=true`, and it logs a warning on every start while that
is in force. Running ClamAV means an always-on container, which small hosting
plans do not have; the alternative worth considering is scanning at the storage
layer.

**Bot checking (`CAPTCHA_DRIVER`).** With `turnstile`, each form submission is
verified with Cloudflare before anything is written. With `noop`, any non-empty
token passes. This one does **not** block startup: the firm has chosen to run
without it for now (DECISIONS, ADR-041). Two defences still apply either way —
the hidden honeypot field, which answers a bot with a plausible reference and
stores nothing, and the per-form rate limit of five submissions per ten minutes
per IP. Turn Turnstile on if spam becomes a problem; it is one environment
variable.

### 2.5 Browser origins

`CORS_ORIGINS` is a comma-separated allow-list of origins that may call the API
from a browser. `*` allows any.

Open is defensible here, and worth understanding rather than just switching on:
every public endpoint is public by definition, and CORS is not what protects
the admin API. The access token lives in the dashboard's memory, which no other
origin can read, and the refresh cookie is `SameSite=Strict`, so no cross-site
request carries it. A hostile page can call the public endpoints — which it
could do from a server anyway — and gets nothing on the admin side.

Narrow it to the real frontend origins once they exist. It costs one variable
and removes a class of mistake.

Note that with `*` the API still reflects the caller's origin rather than
answering a literal `*`: browsers reject a wildcard on a credentialed request,
and a literal one would break signing in.

### 2.6 Production environment checklist

The API validates all of this at startup and prints every problem at once, so
a bad configuration fails in seconds rather than on the first upload. In
production it additionally refuses:

- `STORAGE_PUBLIC_DRIVER=local` — writes images nothing serves,
- `STORAGE_PRIVATE_DRIVER=local` — keeps CVs on the container's disk, which on
  most platforms is wiped on every restart, and exposes a file route,
- `VIRUS_SCAN_DRIVER=noop` **unless** `ALLOW_UNSCANNED_UPLOADS=true` (2.4),
- `MAILER_DRIVER=log` — sends nothing at all,
- any of the three secrets still holding its example value.

It does **not** refuse `CAPTCHA_DRIVER=noop`; see 2.4.

`TRUST_PROXY_HOPS` must equal the number of reverse proxies in front of the
API. Get it wrong and `req.ip` becomes whatever the caller puts in
`X-Forwarded-For`: every rate limit is bypassable, and the hashed IP kept for
abuse investigation is worthless. One load balancer means `1`.

---

## 3. Deploying

### 3.1 On Render (the current plan)

Render builds from the repository. The service is a **Web Service** on the Node
runtime:

| Setting       | Value                     |
| ------------- | ------------------------- |
| Build command | `npm ci && npm run build` |
| Start command | `npm start`               |
| Health check  | `/api/v1/health`          |

Set every variable from §2 in Render's environment settings, and
`TRUST_PROXY_HOPS=1` — Render puts one proxy in front of the service.

Two things about the free plan are worth knowing before they surprise you:

- **The disk is ephemeral.** Anything written to it is lost on every deploy and
  every restart. That is why `STORAGE_PUBLIC_DRIVER` and
  `STORAGE_PRIVATE_DRIVER` must be `cloudinary` and `s3` in production — with
  the local drivers, images and CVs would vanish silently.
- **The service sleeps after inactivity** and takes ~30 seconds to wake. The
  first visitor after a quiet night waits. The retention sweep runs a minute
  after each start, so it still runs; it simply runs more often than daily.

### 3.2 The container image

Also supported, and what CI builds. Two stages: the toolchain stays in the
build stage, and the runtime is `node:24-alpine` running as the non-root `node`
user.

```bash
docker build -t spa-ajibade-api:<git-sha> .
docker run -p 4000:4000 --env-file .env spa-ajibade-api:<git-sha>
```

### 3.3 Running the operational scripts

Three things are done from a shell, not over HTTP. They are compiled into the
build, so they run with plain `node` and need no dev dependencies.

| Task                    | Command                                              |
| ----------------------- | ---------------------------------------------------- |
| Apply database indexes  | `node dist/scripts/sync-indexes.js`                  |
| Load the launch content | `node dist/scripts/load-launch-content.js --confirm` |

Render's Shell tab is a paid feature, so on the free plan run them **from your
own machine instead** — they reach the database over the network and do not
need to run on the server. Put the production `MONGODB_URI` in a local `.env`
and use the npm scripts, which load it:

```bash
npm run db:sync-indexes
npm run load-launch-content -- --confirm
```

Mind which database that `.env` points at: these are the same commands you
would run against a local one.

With Docker, or on a plan that has a shell:

```bash
docker run --rm --env-file .env spa-ajibade-api:<sha>   node dist/scripts/sync-indexes.js
```

### 3.4 Rolling out

1. **Apply indexes first.** They are declared in the models but not created
   automatically in production.
   ```bash
   node dist/scripts/sync-indexes.js
   ```
   Safe to run repeatedly; it creates what is missing and leaves the rest.
2. **Deploy.**
3. **Watch the health check.** `GET /api/v1/health` answers without touching
   the database, so a slow Atlas connection does not read as a dead service.
4. **Confirm.** `GET /api/v1/site` should return the firm's settings, and
   `GET /api/v1/pages/home` the composed home page.

### 3.5 Rolling back

Redeploy the previous commit or image tag. The API makes no destructive schema
changes on startup, so a rollback needs no database step — with one exception:
if the deploy you are rolling back from added a field the dashboard has already
written, that data stays and is ignored.

### 3.6 Zero-downtime notes

On `SIGTERM` the API stops accepting connections, lets in-flight requests
finish, closes the database and exits — up to ten seconds, then it exits
anyway. Give the platform a termination grace period of at least 15 seconds, or
it will `SIGKILL` an editor's save mid-write.

---

## 4. The four accounts

There is no sign-up and no first-administrator step. Four accounts exist, one
per role, and the API creates any that are missing when it starts (ADR-043).
Each takes its password from the environment:

| Username       | Password variable | Role           | Sees                             |
| -------------- | ----------------- | -------------- | -------------------------------- |
| `admin`        | `ADMIN_PASSWORD`  | `admin`        | Everything.                      |
| `editor`       | `EDITOR_PASSWORD` | `editor`       | Content, pages, settings, media. |
| `hr`           | `HR_PASSWORD`     | `hr`           | Jobs, applications and CVs.      |
| `business_dev` | `BIZDEV_PASSWORD` | `business_dev` | Enquiries and messages.          |

Sign in at the dashboard with the **username**, not an email address. There is
no second factor.

Three things worth knowing:

- **An account whose password variable is unset is not created.** The API still
  starts and logs which ones it skipped. Add the variable and restart.
- **An account that already exists is never touched.** A restart cannot reset a
  password the firm has changed, which is why rotating one is a two-step job —
  see 6.5.
- **Each holder sets their own email**, from the dashboard, with
  `PATCH /admin/auth/me`. That address is where their role's notifications go:
  enquiries and messages to `business_dev`, job applications to `hr`. Until one
  is set, those notifications are skipped and the skip is logged.

Give people the narrowest account that covers their work. `business_dev` cannot
read a CV and `hr` cannot read a client enquiry, which is the point of having
four rather than one.

## 5. Loading the firm's launch content

Once, into an empty database, so nobody retypes the website copy.

```bash
node dist/scripts/load-launch-content.js --confirm
```

It refuses to run if any content already exists, so it cannot overwrite the
firm's work, and a run that fails partway undoes itself rather than leaving a
half-loaded database the guard would then refuse to fix.

**Collections** — practice areas, people, offices, insights, recognitions, FAQs
and jobs — are created as **drafts** with **no images**, and vacancies are
created closed. The firm reviews each item, uploads the real photographs, and
publishes.

**Pages and settings are the exception, and it matters.** They are singletons
with no draft state — the site has no shell without them — so the page copy is
**live the moment the loader runs**, including any `[PENDING FROM FIRM]`
markers left by the transcription. Run this _before_ the domain points at the
site, and review the page text early. The script says so when it finishes.

---

## 6. Rotating secrets

### 6.1 Rotatable without ceremony

`JWT_ACCESS_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `CLOUDINARY_URL`,
`S3_*`, `FRONTEND_REVALIDATE_SECRET`, `SENTRY_DSN`.

Set the new value and redeploy. Rotating `JWT_ACCESS_SECRET` signs everyone out
immediately — every access token becomes unverifiable — which is exactly what
you want during an incident. Rotating `FRONTEND_REVALIDATE_SECRET` must be done
on the site at the same time, or revalidation silently stops.

### 6.2 A role password

The API never overwrites an account that exists, so changing the environment
variable alone does nothing. Two steps:

1. Change the password from the dashboard, as that account
   (`POST /admin/auth/password` with the current and new password). This also
   ends every session it holds.
2. Update the matching environment variable, so a future rebuild from an empty
   database creates it with the password now in use.

If nobody can sign in to do step 1 — the password is lost — delete the account
and restart; the API recreates it from the environment.

```js
db.users.deleteOne({ username: 'editor' });
```

### 6.3 Somebody has left the firm

Change their role's password (6.2) and tell the others the new one. With one
account per role rather than one per person, this is the departure procedure:
there is no individual account to disable.

This is the trade-off the firm accepted in ADR-043. Shared accounts mean the
audit log answers "which role read this CV" rather than "which person", so
where individual attribution matters, the answer has to come from who held the
password at the time.

### 6.4 `IP_HASH_SALT`

Rotating it makes existing hashed IPs uncomparable with new ones. That is
acceptable — they exist only for abuse investigation — but say so in the change
record so nobody later reads the discontinuity as tampering.

---

## 7. Incidents

### 7.1 A compromised administrator account

1. **End their sessions.** `POST /admin/users/:id/revoke-sessions`, as an
   administrator. It revokes the refresh chain _and_ invalidates the access
   tokens already issued, so a stolen bearer token stops working on its next
   request rather than at the end of its fifteen minutes. It needs no password
   and is audit-logged.
2. **Deactivate the account.** `PATCH /admin/users/:id` with
   `{ "isActive": false }`. This also takes effect on the next request: the API
   reloads the user on every authenticated call. Do this if you are not yet
   sure the account is safe to keep open.
3. **Change that role's password** (6.2), since whoever had it still knows it.
4. **Read the audit log.** `GET /admin/audit-logs?actor=<id>` shows what they
   reached. Every read of a single submission, and every CV link issued, is
   recorded there with a timestamp.
5. **If a CV link was issued**, assume the CV was downloaded — a link is
   forwardable within its five minutes.

### 7.2 A suspected data disclosure (NDPA 2023)

Nigeria's Data Protection Act obliges the firm to assess and, where required,
report. The API's part is evidence:

- `auditLogs` records who read which submission and when, and who was issued a
  CV link. Export the relevant window before anything expires.
- Application records are deleted by a TTL index at `RETENTION_APPLICATION_DAYS`
  and enquiries at `RETENTION_ENQUIRY_DAYS`. **Preserve what you need before it
  expires**; the deletion is MongoDB's and cannot be paused selectively. To hold
  everything, drop the TTL index and restore it afterwards, recording why.

The firm's data protection officer leads; this document does not replace their
judgement.

### 7.3 The site is showing stale content

The API caches composed pages in process for five minutes and asks the site to
revalidate after every write.

1. Check the API is returning fresh data: `GET /api/v1/pages/home` directly.
2. If the API is fresh and the site is not, revalidation is failing. It is
   fire-and-forget by design — the firm saving a page must not fail because the
   site is down — so look for `frontend revalidation failed` in the logs.
3. Check `FRONTEND_REVALIDATE_URL` and that the secret matches the site's.
4. To force it, make a trivial edit and save; that re-sends the tags.
5. Restarting the API clears its own cache, which is the blunt instrument.

### 7.4 Uploads are failing

- **415** — the file is not what it claims. The check reads magic bytes, so a
  renamed `.pdf` fails correctly.
- **413** — over the limit: 10 MB for images, 5 MB for CVs.
- **500 on an application** — usually the virus scanner is unreachable. The API
  refuses rather than storing an unscanned CV. Check the ClamAV endpoint.
- **A CV link returns 409** — the scan has not finished, or the file was found
  infected. An infected file is never downloadable; delete the application.

### 7.5 Everything is 500

1. `GET /api/v1/health` — if that answers, the process is alive and the
   database is the suspect.
2. Check Atlas: connection limit, IP allow-list, cluster paused.
3. Check the logs for `failed to start`; a configuration error names every
   problem at once.
4. Errors are reported to Sentry if `SENTRY_DSN` is set, tagged with the route
   pattern and the release.

---

## 8. Backups and restore

Atlas continuous backup, retained per the firm's policy. The API holds no state
outside MongoDB except uploaded files, which live in Cloudinary and S3 and have
their own durability.

### 8.1 Restoring

1. **Stop writes.** Scale the API to zero, or put the platform in maintenance.
   Restoring under live traffic produces a database that disagrees with itself.
2. Restore the snapshot in Atlas, to a new cluster if you want to inspect it
   first.
3. Point `MONGODB_URI` at the restored cluster and deploy.
4. Run `scripts/sync-indexes.ts` — a restore does not always bring indexes.
5. **Reconcile the files.** A restore rewinds the database but not the buckets,
   so:
   - images uploaded after the snapshot are in Cloudinary but not in the
     database — harmless, invisible, and removable by hand;
   - **CVs are the reverse risk**: an application restored from before its CV
     was deleted points at a file that is gone. The link will 404. This is not
     a bug in the restore; it is the retention policy working.
6. Check `GET /api/v1/site` and sign in to the dashboard before reopening
   traffic.

### 8.2 What a restore loses

Everything written after the snapshot: submissions, content edits, media
records, audit entries. Say so plainly to the firm — a lost enquiry is somebody
who thinks they have contacted a lawyer and has not.

---

## 9. Routine maintenance

| Task                       | When      | How                                              |
| -------------------------- | --------- | ------------------------------------------------ |
| Dependency advisories      | Weekly    | CI fails on a high-severity production advisory. |
| Review admin accounts      | Quarterly | Remove leavers. `GET /admin/users`.              |
| Check the retention sweep  | Monthly   | Look for `swept orphaned CV files`; see 9.1.     |
| Confirm backups restore    | Annually  | A backup nobody has restored is a hypothesis.    |
| Rotate `JWT_ACCESS_SECRET` | Annually  | Signs everyone out; do it out of hours.          |

### 9.1 The retention sweep

Deletes CV files whose application has been expired by the TTL index. It runs
a minute after startup and then daily. If the container restarts more often
than that, it still sweeps each time.

To check it is working: compare the object count in the CV bucket against
`db.applications.countDocuments()`. The bucket may legitimately be slightly
higher — files uploaded within the last hour are spared, because a CV is stored
just before its record is written and the sweep must not delete an upload in
flight.

---

## 10. Where to look next

- `docs/API.md` — endpoints, conventions, the role matrix.
- `docs/ARCHITECTURE.md` — layers, request flow, media lifecycle, caching.
- `docs/DECISIONS.md` — why things are the way they are, including every
  security finding and its fix.
- `.claude/rules/submissions.md` — the personal-data rules, in full.
- `openapi/openapi.yaml` — the contract. It is the source of truth for shapes.
