# Admin activity and exports

Roadmap B, approved 6 November 2026. Verification evidence is recorded in the living report and `audit/dashboard-extras-2026-11-06/README.md`.

## Use it

Sign in as an Admin and open **Admin → Live dashboard** (`/admin/dashboard`). Ordinary users, Instructors, Reviewers and Support cannot read or export these numbers. Revoking Admin access also revokes the export endpoint immediately.

**Peak hours · UTC** counts designs and runs created in the rolling interval `[snapshot time minus 28 days, snapshot time)`. Monday 00:00 is the first cell; Sunday 23:00 is the last. The three totals next to this grid use that same interval. They are intentionally different from all-time cards and the existing 24-hour charts. Every cell shows a number; **Show activity as table** exposes all 168 counts without relying on colour. On phones, only the grid/table scrolls horizontally.

**Export this view** has CSV, JSON and PDF downloads. Each click captures the displayed snapshot, even while later dashboard polls update the screen. Pause is available if you want all three files from the same snapshot. Filenames contain its UTC timestamp.

- JSON contains the complete strict aggregate snapshot, including its SHA-256 key.
- CSV is `key,value`, with numeric values only. Booleans become 0/1; timestamps become `.unixMs`; null becomes `.present,0`. Closed enum values and the snapshot digest are encoded in keys with value 1. No arbitrary text, spreadsheet formulas, account identifiers or content is exported.
- PDF is a one-page headline summary, built locally with the existing dossier drawing pipeline. It identifies the UTC source and snapshot key; it is not the complete JSON/CSV dataset.

Snapshots are retained in the API process for five minutes, with a maximum of 128. Heavy polling across many sessions can evict an older snapshot sooner. Expiry, eviction or restart gives an explicit local error: refresh the dashboard and click again. The API never silently substitutes newer figures. Multi-process deployment would need shared retention; this prototype uses one API process.

Each accepted export request increments a Redis counter by UTC date and format (CSV, JSON, PDF); the key expires after 90 days. No user or file content is logged. This counts accepted source requests, not successful local file saves. If Redis cannot record it, no export is returned. An interrupted local PDF may therefore still count. No new database migration, dependency or AI call is required.

## API

`GET /v1/admin/metrics` returns the cached aggregate view with `heatmap` and `snapshotKey`.

`GET /v1/admin/metrics/export?format=csv|json&snapshot=<64 lowercase hex>&purpose=download|pdf` returns the normal `{ data }` envelope containing `fileName`, `contentType`, `content` and `snapshotKey`. PDF requests use `format=json&purpose=pdf`; the browser draws the PDF from that source. Missing/invalid arguments return 422; an unavailable retained snapshot returns 404 with `METRICS_SNAPSHOT_EXPIRED`; auditing outage returns 503. Every request checks the existing Admin metrics permission. Canonical schemas and query parameters are published in the phase 3 OpenAPI document.

## Verification

See the dated evidence record for exact commands, results, deliberate failures and limits. Never infer full-project regression coverage from the focused browser checks.
