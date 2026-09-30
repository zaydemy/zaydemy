# @zaydemy/adapters

Drivers for everything zaydemy needs from the outside world. Each is chosen by
configuration (`@zaydemy/config`), so a self-hosted install needs nothing but
Postgres, and swapping a provider never touches application code.

| Adapter        | Drivers                         | Default          |
| -------------- | ------------------------------- | ---------------- |
| Email          | `console`, `smtp`, `resend`     | `console` in dev |
| File storage   | `local`, `s3` (S3-compatible)   | `local`          |
| Bot protection | `none`, `turnstile`, `hcaptcha` | `none`           |

Rules the drivers keep:

- **Email** `send` throws unless the provider accepted the message, so nobody is
  told "we sent you a code" when it was not sent.
- **Storage** keys are always built by the server (`buildKey`); upload URLs are
  short-lived and fix the content type and exact size. Files are never
  overwritten, and `keyOf` only recognizes the app's own URLs, so external links
  are never "deleted".
- **Bot protection** fails open only when the provider cannot answer; a missing
  or invalid token is always rejected, and the verdict comes from the response
  body, never the HTTP status.
