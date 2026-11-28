# Admin accounts and role-holder directory

26 November 2026. Local, uncommitted implementation. Functional and visual verification passed; the full production frontend build has not been rerun.

The Accounts and roles page now leads with a dedicated Role holders table. It lists only accounts currently assigned Instructor, Support or Admin roles, including suspended holders and legacy Admins. Ordinary User and Reviewer-only accounts are excluded from this directory. An account with several roles appears once. The table shows name/email, actual roles, status and joined date, with a Manage button that opens and focuses the existing account controls.

Filters select All role holders, Instructor, Support or Admin. Refresh reloads current data; Load more uses a cursor. Loaded-row counts are explicitly labelled, not presented as global account totals. Find an account remains available separately for searching any account before granting a role. Existing confirmation steps, self-suspension/last-Admin restrictions, revoked sessions and append-only audit history remain in place. The audit log has quieter spacing and aligned timestamps.

## API and privacy

`GET /v1/admin/users/privileged` requires live ADMIN_USERS_READ permission. Query accepts only optional role=instructor|support|admin, limit1..20 (default12), and paired before/beforeId cursor fields. The response is {data:{items:[AdminUser],next:{at,id}|null}}. SQL filters current role membership and legacy Admin status, with one row per account. It never derives current roles from audit history. Ordering uses millisecond-truncated created_at plus UUID to avoid tied timestamp pagination gaps. Only id, displayName, email, roles, status and createdAt are projected; no credential or design fields.

No database migration, new dependency or frontend route. Existing search, grants/revocations, suspend/restore and audit endpoints are retained. Frontend queries are account-keyed, errors stay local and successful mutations invalidate the directory and search/audit caches.

## Code map

- Backend: roles.schema.ts, AccountRolesService.directory, AdminController.directory and canonical phase3 OpenAPI.
- Frontend: api/admin.ts, admin/admin-users.tsx, admin/role-directory.tsx, styles/admin-accounts.css and app/admin/users/page.tsx.
- Tests: admin-directory.spec.ts, admin-directory.e2e-spec.ts, additive r2-admin unit coverage and browser/admin-role-directory.spec.ts.

## Verification and remaining work

Backend build, two new unit tests, six isolated integration tests,13 Admin UI unit tests, TypeScript and scoped frontend/backend lint passed. Deliberately removing the role predicate made the HTTP privacy test fail; the temporary patch was removed and all six integration checks passed again. Initial combined HTTP run had27/31 passes: three new tests shared older fixture accounts (fixed with isolated suite reset), and one existing suspend/restore refresh test failed once but passed unchanged when rerun alone. Earlier passing cases were retained; this is not a claim of one green combined31-test process.

The isolated Next dev server compiled /admin/users and returned200; the new directory stylesheet was fetched successfully. Earlier Chrome attempts stalled at launch under less than50MiB free RAM and were stopped. The expected owner frontend at3000 was no longer listening; owner processes were not restarted or terminated. At initial implementation close no completed browser/visual run or full production build was claimed. The follow-up below closes the browser/visual gap; the full production build remains unperformed. All browser account APIs are mocked; actual Nest/Postgres access/privacy/cursor behavior is covered by the separate integration suite. Evidence: docs/audit/admin-directory-2026-11-26/.

Use Admin -> Accounts and roles after starting the normal backend/frontend. Do not run fixture resets on the owner's database. Preserve the living report history and append new verification evidence to the same report when remaining checks finish.


## Visual acceptance follow-up — 26 November 2026

The earlier visual limitation is now closed:12/12 Chrome journeys passed across1024/1440 light/dark, also testing390/320 widths. Manually reviewed desktop/table and lower-page audit screenshots. Fixed a hidden Actions label escaping the horizontal table container (main overflow615px at390px) by positioning its scroll container, and improved light status text from3.59:1 using semantic text colors. Final tests enforce>=4.5 status contrast, actual main-container bounds, native keyboard scrolling/focus, role-filter/Manage behavior, pagination/retry/role removal/non-Admin denial and absence of unexpected console/page errors. Audit fixtures include long email strings. Evidence: docs/audit/admin-directory-visual-2026-11-26/.

Tests use controlled accounts and response fixtures; no owner database writes. No full production build or all-feature regression is claimed. Follow-up remains local/uncommitted/unpushed.
