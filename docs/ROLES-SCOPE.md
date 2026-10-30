# Roles track: Instructor, Reviewer and Admin (scope and decisions)

Status: **proposed 2026-10-30, awaiting the user's decisions.** Nothing here is built. It extends the approved four-role direction in [PROJECT-PLAN](PROJECT-PLAN.md) (User, Instructor, Reviewer, Admin) and keeps its rules. Needs no AI. Follows the same method as [M15](M15-HISTORY-COMPARE-NOTES-SCOPE.md) and [M16](M16-REPORT-SHARING-SCOPE.md): decisions first, then gated slices.

## 1. Where the code is today (verified)

| Area | Today |
| --- | --- |
| Role storage | One `users.role` column. A database check allows only `user` and `admin`. |
| Role model | `Role.USER` and `Role.ADMIN` with a **ranked chain** (a higher rank satisfies a lower requirement). That does not fit a faculty member who is Instructor and Reviewer but not Admin. |
| Enforcement | A `RolesGuard` and an `@Roles()` decorator exist, but **no endpoint uses them**. Admin cannot do anything yet. |
| Assignment | Registration never sets a role, so everyone is `user`. There is **no way to change a role** (no endpoint, no screen). The seeder creates only `user` accounts. |
| Sessions | The role is carried **inside the access token**, so a role change would not reach an already-issued token until it is refreshed. |
| Access to designs | Owner only. Anyone else gets 403. The M16 share links are anonymous read-only snapshots and are **not** a review system. |
| Web | No role-aware UI. `/challenges` and `/challenges/:id` are placeholders. There are no admin, review or instructor routes. |

## 2. Rules that are not negotiable (from the approved plan)

- Permissions are enforced on the **API**, not only hidden in the UI.
- Registration can never grant a privileged role.
- Having the Instructor or Reviewer role grants **no access** to anyone's private design. Access needs an explicit, scoped grant from the owner.
- Reviewers never change the owner's graph. Feedback names the revision it reviewed, and later edits cannot silently change that context.
- Every role's permitted and forbidden operations, cross-account access, revoked grants, stale sessions and multi-role accounts are tested, and today's User flows keep working.
- No paid service, no email system. No AI is involved.

## 3. Slices

| Slice | Delivers | Depends on |
| --- | --- | --- |
| **R1 Foundations** | Multi-role model, permission matrix in code, admin-only role assignment API, safe first-admin bootstrap, role-change audit log, `GET /me` exposes roles, web hook and forbidden screen for role areas, demo accounts for the course demo (dev only) | none |
| **R2 Admin tools** | `/admin/users`: search, view roles, grant or revoke a role, suspend or restore an account, read the audit log. Admins cannot read private designs. | R1 |
| **R3 Review grants** | Owner shares one frozen revision (and chosen result) with one named Reviewer account. Reviewer gets a "Shared with me" list and a read-only view (reusing the M16 snapshot machinery). Owner can revoke at any time. | R1 |
| **R4 Reviewer feedback** | Comments tied to the reviewed revision. Owner sees feedback and can reply. Visibility rules after revoke (decision 6). | R3 |
| **R5 Instructor** | Instructors publish challenges (a goal, a traffic profile, a starting design). Users attempt them and explicitly submit a revision. The server checks the goal from the model's own result. Instructors see submissions to their own challenges and can leave feedback. | R1, R3, R4 |

Each slice follows the usual gates: backend e2e on the isolated database, permission matrix tests, mutation checks (each break must fail a test), web unit and browser journeys in 4 projects, full regression, commit by path, protected audit file never staged.

## 4. Decisions needed (recommendation first)

1. **Role model.** Recommended: an account has a **set** of roles (a `user_roles` table with who granted it and when). User is the implicit base. **No inheritance**: Admin does not automatically become Instructor or Reviewer, and each is granted separately and audited. Alternative: keep one role per account (simpler, but a faculty member cannot be both).
2. **How roles are assigned.** Recommended: only an Admin can grant or revoke, through the API. The **first Admin** is created by a one-time operator command run on the server, never through the website. No self-service and no role requests in the first version. Alternative: let users request a role and an Admin approves.
3. **After a role change.** Recommended: privileged endpoints read the user's roles from the **database on every call** (the token only identifies the user), and removing a role revokes that account's refresh sessions. So revoking Admin takes effect immediately. Alternative: trust the token until it expires (simpler, but a removed Admin keeps access for a while).
4. **Review grants.** Recommended: the owner grants **one Reviewer account, by email, for one frozen revision and result**. The Reviewer must already exist and hold the Reviewer role (no invitation emails). Sharing a later revision is a new grant. An owner cannot grant themselves. Alternative: grant access to the live design (rejected, because the reviewed context would change).
5. **Who can see what.** Recommended: a Reviewer or Instructor sees the owner's **display name only**, never email. Admins see account details (email, roles, status) but **never design content**.
6. **Feedback after a grant is revoked.** Recommended: the owner **keeps** all feedback already given (it is about their design) and sees who wrote it. The Reviewer loses access to the snapshot and cannot read or add more. Comments are plain text, 2,000 characters, up to 50 per grant. Reviewers edit or delete their own comments. The owner can reply but cannot edit a Reviewer's words. Alternative: delete feedback on revoke.
7. **Admin limits.** Recommended: Admin can grant or revoke roles and **suspend or restore** an account (login blocked, data kept). There is **no delete** in the first version. The last Admin cannot be removed or suspended. Every action is written to an audit log that Admins can read and nobody can edit.
8. **Instructor scope.** Recommended: **challenges first** (a goal such as p95 and error budget at a traffic profile, plus a starting design). Example designs are just challenge starting points. A User submits a revision explicitly; the **server** decides pass or fail from the model's recorded result and never trusts the client. Instructors see only submissions to their own challenges. Alternative: add a separate example-designs library.
9. **Course demo.** Recommended: a dev-only script creates one demo account per role plus sample data, refused in production, so all four roles can be shown. Alternative: create accounts by hand.
10. **Order.** Recommended: R1, R2, R3, R4, R5, because review reuses the M16 share machinery and Instructor depends on review. Alternative: Instructor before review.

## 5. Data sketch (all additive)

`user_roles(user_id, role, granted_by, granted_at)`; `account_status` on users (active or suspended); `role_audit(actor, target, action, role, at)`; `review_grants(id, design_id, owner_id, reviewer_id, frozen_report, revoked_at, created_at)`; `review_comments(grant_id, author_id, parent, text, created_at, edited_at)`; `challenges(id, instructor_id, title, goal, traffic, starting_snapshot, published_at)`; `challenge_submissions(id, challenge_id, user_id, frozen_report, result, submitted_at)`. The existing `users.role` column stays during R1 as a read-through so nothing breaks, and its admin rows are copied into `user_roles`. Its database check is widened, never loosened silently.

## 6. Test matrix (every slice)

For each role (guest, User, Reviewer, Instructor, Admin, and a User with two roles): the permitted operations succeed and the forbidden ones return 403 or 404. Plus: another account's design, a revoked grant, an expired or stale session after a role change, a suspended account, self-grant, last-Admin protection, DTO leak checks (no email, no private notes) and a User-flow regression.

## 7. Not in scope

Email invitations or notifications, OAuth or SSO, teams and organisations, billing, public profiles, AI features for any role, and deleting accounts.

## 8. Operator steps

Migrations are additive (`pnpm migration:run`). R1 adds the one-time first-Admin command. The dev and QA databases must be migrated before the matching code is run, as happened with M15 and M16.

## 9. Risks

Multi-role mistakes (a permission check that forgets a role) are the main risk, so permissions are one table in code and every endpoint is tested against it. Reviewer and Instructor data must never leak owner contact details. Role changes must take effect at once (decision 3). The course demo needs all four roles to be demonstrable (decision 9).
