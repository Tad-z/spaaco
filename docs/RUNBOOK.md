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

| What                  | Where it goes                                         | Notes                                                   |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| MongoDB Atlas cluster | `MONGODB_URI`                                         | A dedicated database, not shared with another product.  |
| Cloudinary account    | `CLOUDINARY_URL`                                      | Serves every image on the site.                         |
| S3 bucket (private)   | `S3_*`                                                | CVs only. Must not be public — see 2.3.                 |
| Resend account        | `RESEND_API_KEY`, `MAIL_FROM`                         | Acknowledgements and notifications.                     |
| Cloudflare Turnstile  | `TURNSTILE_SECRET_KEY`                                | Bot check on the three public forms.                    |
| A ClamAV endpoint     | `CLAMAV_HOST`, `CLAMAV_PORT`                          | Scans CVs. See 2.4 if the firm has no appetite for one. |
| Firm mailboxes        | `NOTIFY_ENQUIRIES_TO`, `NOTIFY_APPLICATIONS_TO`       | Where "a new enquiry arrived" goes.                     |
| Frontend URLs         | `CORS_ORIGINS`, `ADMIN_DASHBOARD_URL`, `API_BASE_URL` | Exact origins, comma-separated for CORS.                |

### 2.2 Secrets to generate

Three, none of which may be a placeholder in production — the API refuses to
start if `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY` or `IP_HASH_SALT` still holds the
value from `.env.example`.

```bash
# JWT_ACCESS_SECRET — any long random string
openssl rand -base64 48

# ENCRYPTION_KEY — exactly 64 hex characters (32 bytes). Encrypts TOTP secrets.
openssl rand -hex 32

# IP_HASH_SALT — any long random string
openssl rand -base64 32

# FRONTEND_REVALIDATE_SECRET — must match the value the site expects
openssl rand -base64 32
```

Store them in the platform's secret manager, never in the repository, never in
a build argument, and never in a `.env` file inside the image.

**`ENCRYPTION_KEY` is not rotatable without work.** It decrypts every stored
TOTP secret; changing it locks every administrator out of their authenticator.
See 6.2.

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

### 2.4 If there is no ClamAV

`VIRUS_SCAN_DRIVER=noop` marks every CV `clean` without looking at it, and the
dashboard then tells HR the file was scanned. **The API refuses to start in
production with the noop scanner** for that reason.

If the firm will not run a scanner, that is a decision for them to take
knowingly — scan at the storage layer instead (S3 malware scanning, or a
GuardDuty equivalent) and only then relax the check in `src/config/env.ts`, with
an ADR recording who decided and why.

### 2.5 Production environment checklist

The API validates all of this at startup and prints every problem at once, so
a bad configuration fails in seconds rather than on the first upload. In
production it additionally refuses:

- `STORAGE_PUBLIC_DRIVER=local` — writes images nothing serves,
- `STORAGE_PRIVATE_DRIVER=local` — keeps CVs on the container disk and exposes
  a file route,
- `VIRUS_SCAN_DRIVER=noop` — see 2.4,
- `MAILER_DRIVER=log` — sends nothing at all,
- any of the three secrets still holding its example value.

`TRUST_PROXY_HOPS` must equal the number of reverse proxies in front of the
API. Get it wrong and `req.ip` becomes whatever the caller puts in
`X-Forwarded-For`: every rate limit is bypassable, and the hashed IP kept for
abuse investigation is worthless. One load balancer means `1`.

---

## 3. Deploying

### 3.1 The image

```bash
docker build -t spa-ajibade-api:<git-sha> .
```

Two stages: the toolchain stays in the build stage, and the runtime is
`node:24-alpine` running as the non-root `node` user. CI builds it on every push
to `main`.

### 3.2 Rolling out

1. **Apply indexes first.** New indexes are declared in the models but not
   created automatically in production.
   ```bash
   docker run --rm --env-file <(platform env) spa-ajibade-api:<sha> \
     node --import tsx scripts/sync-indexes.ts
   ```
   Safe to run repeatedly; it creates what is missing and leaves the rest.
2. **Deploy the image** with `RELEASE=<git-sha>` set, so error reports name the
   deploy they came from.
3. **Watch the health check.** `GET /api/v1/health` answers without touching the
   database, so a slow Atlas connection does not read as a dead container.
4. **Confirm.** `GET /api/v1/site` should return the firm's settings, and
   `GET /api/v1/pages/home` the composed home page.

### 3.3 Rolling back

Redeploy the previous image tag. The API makes no destructive schema changes on
startup, so a rollback needs no database step — with one exception: if the
deploy you are rolling back from added a field the dashboard has already
written, that data stays and is ignored.

### 3.4 Zero-downtime notes

On `SIGTERM` the API stops accepting connections, lets in-flight requests
finish, closes the database and exits — up to ten seconds, then it exits
anyway. Give the platform a termination grace period of at least 15 seconds, or
it will `SIGKILL` an editor's save mid-write.

---

## 4. Creating the first administrator

There is no way to create an account over HTTP without an existing admin. This
is deliberate.

```bash
docker run --rm -it --env-file <(platform env) spa-ajibade-api:<sha> \
  node --import tsx scripts/create-admin.ts
```

It asks for a name, email, password (12 characters minimum) and roles. The new
administrator then:

1. signs in at the dashboard with email and password,
2. is required to enrol an authenticator before any other admin route works,
3. scans the QR code and confirms a code.

**Until two-factor is enrolled, that account can do nothing else.** If somebody
enrols the wrong device, see 6.3.

Roles, from `docs/API.md`:

| Role           | Can reach                                  |
| -------------- | ------------------------------------------ |
| `admin`        | Everything.                                |
| `editor`       | Content, pages, settings, media.           |
| `hr`           | The jobs collection, applications and CVs. |
| `business_dev` | Enquiries and messages.                    |

Give people the narrowest role that covers their work. `business_dev` cannot
read a CV and `hr` cannot read a client enquiry, which is the point.

---

## 5. Loading the firm's launch content

Once, into an empty database, so nobody retypes the website copy.

```bash
docker run --rm --env-file <(platform env) spa-ajibade-api:<sha> \
  node --import tsx scripts/load-launch-content.ts --confirm
```

It refuses to run if any content already exists, so it cannot overwrite the
firm's work. Everything is created as **draft** with **no images**: the firm
reviews each item in the dashboard, uploads the real photographs, and publishes.

---

## 6. Rotating secrets

### 6.1 Rotatable without ceremony

`JWT_ACCESS_SECRET`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `CLOUDINARY_URL`,
`S3_*`, `FRONTEND_REVALIDATE_SECRET`, `SENTRY_DSN`.

Set the new value and redeploy. Rotating `JWT_ACCESS_SECRET` signs everyone out
immediately — every access token becomes unverifiable — which is exactly what
you want during an incident. Rotating `FRONTEND_REVALIDATE_SECRET` must be done
on the site at the same time, or revalidation silently stops.

### 6.2 `ENCRYPTION_KEY` — not a simple rotation

It decrypts every stored TOTP secret. Changing it means every administrator
must re-enrol:

1. Announce it. Everyone needs their phone to hand.
2. Set the new key and deploy.
3. For each user, clear the stored secret so they are prompted to enrol again:
   ```js
   db.users.updateMany({}, { $set: { 'totp.enabled': false, 'totp.secretEncrypted': null } });
   ```
4. Each administrator signs in and enrols a new authenticator.

Between steps 2 and 3, sign-in fails for everyone with a stored secret. Do it in
one sitting.

### 6.3 One person's authenticator is lost

An admin clears it for them; there is no self-service path, because a
self-service path is a way around two-factor.

```js
db.users.updateOne(
  { email: 'person@spaajibade.com' },
  { $set: { 'totp.enabled': false, 'totp.secretEncrypted': null } }
);
```

They sign in with their password and enrol again. Confirm who you are speaking
to by some means other than email first.

### 6.4 `IP_HASH_SALT`

Rotating it makes existing hashed IPs uncomparable with new ones. That is
acceptable — they exist only for abuse investigation — but say so in the change
record so nobody later reads the discontinuity as tampering.

---

## 7. Incidents

### 7.1 A compromised administrator account

1. **Deactivate the account.** `PATCH /admin/users/:id` with
   `{ "isActive": false }`, or in the database. This takes effect on the very
   next request: the API reloads the user on every authenticated call.
2. **Change the password**, which also invalidates every access token already
   issued and revokes the refresh chain.
3. **Clear their TOTP secret** (6.3) in case the authenticator was also taken.
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
