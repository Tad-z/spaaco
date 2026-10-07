---
paths:
  - 'src/**/enquiry*.ts'
  - 'src/**/message*.ts'
  - 'src/**/application*.ts'
  - 'src/**/newsletter*.ts'
  - 'src/integrations/storage/**'
  - 'src/integrations/mailer/**'
  - 'src/templates/emails/**'
---

# Personal data rules (NDPA 2023)

These files handle personal data from prospective clients, job applicants and newsletter subscribers. A leak here is a legal and reputational problem for a law firm, so these rules are strict.

- **Never log** request bodies, names, emails, phone numbers, matter summaries, or file names from these routes. Log only the reference, the form type, and outcome codes.
- **Consent is required:** `consent: true` plus `consentTextVersion`, stored with a timestamp. Reject the request without them.
- **Honeypot:** if `website` is non-empty, respond 201 with a fake reference and store nothing. Bots shouldn't learn they were caught.
- **Captcha:** verify the Turnstile token via the captcha adapter before any DB write.
- **IP:** store only `ipHash = sha256(ip + IP_HASH_SALT)`, never the raw IP.
- **Emails:** notifications to the firm contain the reference, form type, and dashboard link only, with no personal fields. The acknowledgement to the submitter may use their first name.
- **CV uploads:**
  - Use multer memory storage with a 5 MB limit.
  - Detect the type by magic bytes (PDF `%PDF`, DOCX = a ZIP containing `word/document.xml`). Reject anything else with 415.
  - Run the virus scan before storing. If a file is infected, return 422 and store nothing.
  - Store via `storage/private` under a random key (never the original filename).
- **Access:** CV access goes only through signed URLs with a 5-minute TTL, and each access writes an audit log entry.
- **Retention:** TTL indexes use the env retention days, and the orphan-file sweep removes stored CVs whose records have expired.
