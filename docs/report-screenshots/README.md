# Report screenshots (guide Section 6, Figures 6.1 to 6.15)

Taken on 2026-11-09 from the **real** API and the **real** Swagger UI, not mocked. The sample report's figures are written for a
library system, so each one is mapped to the StressForge operation that shows the same kind of evidence.

How they were taken: a throwaway copy of the API on `http://localhost:5055` (so the Request URL in each image says 5055, not 5001)
against the disposable `stressforge_test` database, with `MAIL_ENABLED=false`, driven by Playwright in Chrome. Accounts and tokens in the
images are test values on that disposable database. The terminal-style images (6.10b, 6.11, 6.15) render real command output captured
at the time shown in their first line.

| Figure | File | What it shows | Status shown |
|---|---|---|---|
| 6.1 | `figure-6.01-swagger-ui-overview.png` | Swagger UI at `/docs`: endpoint groups and the Authorize button | n/a |
| 6.2 | `figure-6.02-register-201-created.png` | `POST /v1/auth/register`: response has no password hash | 201 |
| 6.3 | `figure-6.03-login-returns-jwt.png` | `POST /v1/auth/login`: access token in the response | 200 |
| 6.4 | `figure-6.04-missing-token-401-unauthorized.png` | `GET /v1/auth/me` with no token | 401 |
| 6.5 | `figure-6.05-wrong-role-403-forbidden.png` | An ordinary user calling `GET /v1/admin/metrics` | 403 |
| 6.6 | `figure-6.06-create-design-201-created.png` | `POST /v1/designs` with the MVP template graph | 201 |
| 6.7 | `figure-6.07-validation-error-422.png` | `POST /v1/designs` with an empty name and an unknown field; per-field messages | 422 |
| 6.8 | `figure-6.08-stale-revision-409-conflict.png` | `PATCH /v1/designs/{id}` with a stale `expectedRevision` | 409 |
| 6.9 | `figure-6.09-list-with-pagination.png` | `GET /v1/designs?page=1&pageSize=2` | 200 |
| 6.10 | `figure-6.10-transaction-success-201-created.png` | `POST /v1/support/reports`: one request, one transaction | 201 |
| 6.10b | `figure-6.10b-transaction-success-database-rows.png` | psql: the ticket, its activity row and the Support notifications it wrote | n/a |
| 6.11 | `figure-6.11-transaction-rollback-forced-failure.png` | The test that forces a failure mid-transaction, and its passing result | n/a |
| 6.12 | `figure-6.12-run-test-202-accepted.png` | `POST /v1/designs/{id}/simulate`: asynchronous run accepted (stands in for "return book with fine") | 202 |
| 6.13 | `figure-6.13-audit-log-as-admin.png` | `GET /v1/admin/audit?limit=3` as an Admin | 200 |
| 6.14 | `figure-6.14-email-in-mailtrap-inbox.png` | The "Support replied to your report" email in the Mailtrap sandbox | n/a |
| 6.15 | `figure-6.15-migrations-on-an-empty-database.png` | `pnpm migration:run` on an empty database applies all 21 migrations | n/a |

## Honest notes for the report

- **422, not 400, for validation errors.** The guide says "400"; StressForge returns 422 `VALIDATION_FAILED` with the failing field named. State
  this in the report and have it accepted by the instructor.
- **Duplicate key (409).** Figure 6.8 shows a 409 from the optimistic-concurrency check (stale revision). A unique-violation 409 is
  handled globally (commit `d8844ef`) but has no screenshot of its own.
- **6.11** is a test run, not a live Swagger call, because the failure is injected inside the server by the test.
- **6.14** is the only figure that depends on your Mailtrap account. A second view (the status-change email, "Your report SF-1007 is now in
  progress") is in the same inbox if you want it.
- **Capture script** is not part of the repository. Re-run the figures if the API changes.
