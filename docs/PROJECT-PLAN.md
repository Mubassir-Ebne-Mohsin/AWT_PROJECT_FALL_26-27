# STRESSFORGE project plan: roles and future scope

Updated: 2026-10-28 (Asia/Dhaka).

## Established baseline

Phase 1 and Phase 2 are complete for their approved scopes, with the accepted historical benchmark exception recorded in the [living progress report](STRESSFORGE-PROGRESS-REPORT.md). See the [Phase 2 plan](PHASE-2-PLAN.md) for milestone history. This document extends future scope; it does not retroactively add requirements to completed milestones.

## Approved four-role direction

The user approved planning for four account roles: User, Instructor, Reviewer and Admin. Guest remains an unauthenticated access state. These permissions are the planning baseline; detailed workflows and implementation acceptance criteria still require approval before development.

| Role | Purpose | Planned permissions |
| --- | --- | --- |
| User | Create and explore architectures | Manage own designs, configure traffic, run simulations, inspect own results and use AI assistance when implemented. Explicitly submit/share a design for instruction or review. |
| Instructor | Support architecture learning | Publish architecture challenges and example designs; view submissions explicitly shared with them. |
| Reviewer | Give architecture feedback | View explicitly shared designs/results and add comments or recommendations; cannot edit the owner's graph. |
| Admin | Maintain the platform | Manage accounts, role assignments and platform configuration through future administration features. |

Instructor and Reviewer are future additions. The original foundation specifies USER and ADMIN; having those role identifiers does not establish that administration screens exist. The four-role plan is not a claim that all permissions are currently implemented.

A faculty member may perform both Instructor and Reviewer duties. Support for multiple roles per account, database representation and role hierarchy must be decided during technical scoping; do not assume a simple four-level inheritance chain. Instructor and Reviewer are distinct capabilities.

## Phase 3 planning checkpoint

The [Phase 3 plan](PHASE-3-PLAN.md), prepared2026-10-28, proposes M10–M17: benchmark installed Ollama models, introduce grounded AI explanation/improvement/drafting, then complete existing Designs/History/Notes/Compare/Report/Sharing commitments and acceptance. The User/Instructor/Reviewer/Admin direction remains approved; the additional role workflows stay in their dedicated later track. M11 backend foundation has since been explicitly approved and implemented; real inference and M12–M17 are not enabled by this checkpoint.

M10 was subsequently approved and evaluated: **current configuration NO-GO for integration** due to semantic-output failures and insufficient system resources. [M10 results](M10-LOCAL-AI-FEASIBILITY.md) preserve the measurements and propose a safer feasibility follow-up. M11 was subsequently approved and its backend foundation is complete with AI disabled by default; see [M11 guide](M11-AI-FOUNDATION.md). M10 inference approval remains open.

## Delivery sequence

1. Plan the real AI phase against the existing roadmap and actual hardware. Ollama is a candidate, not an approved runtime/model selection. Begin with grounded result explanations, then validated improvement suggestions and architecture drafting. Preserve the simulator as numerical authority.
2. Scope role and permission foundations: inspect current auth/role storage, define an explicit permission matrix, safe migration, account provisioning and administration boundaries.
3. Scope shared review: owner-controlled submission/share grants, recipient checks, revocation, revision/snapshot identity and Reviewer feedback. Define whether previous feedback remains visible after revocation and whether authors can review their own submissions.
4. Scope Instructor activities: architecture challenges, example designs and explicitly shared submissions, focused on learning through simulation.
5. Scope minimal Admin tools for accounts, roles and relevant configuration. Avoid expanding into a management-style application.

The sequence is a recommendation. This planning update authorizes documentation only; no implementation milestone, dates, new routes or model downloads are approved here.

## Acceptance requirements for future role work

- Preserve existing authentication, ownership checks and design/run behavior.
- Enforce permissions on the API as well as the interface; hiding buttons is insufficient.
- Registration cannot grant privileged roles; role assignment is restricted and verified server-side.
- Instructor/Reviewer roles alone grant no access to another user's private designs. Access requires an explicit, scoped grant.
- Review permissions do not allow changing the owner's architecture. Feedback identifies the revision reviewed; later edits cannot silently change that context.
- Define grant revocation and role-change behavior for existing sessions and in-flight operations before implementation.
- Test each role's permitted and forbidden operations, cross-account access, revoked grants, stale sessions, multi-role behavior if selected and regression of current User flows.
- All account roles remain within the zero-paid-service course constraint. AI assistance remains central to the final project; extra roles do not replace it.

## Maintenance

Future phase plans must reference this four-role direction, distinguish shipped functionality from proposed work, and update the same [progress report](STRESSFORGE-PROGRESS-REPORT.md) with evidence. Preserve historical milestone scopes and verification records. Changes and updates do not occur automatically.
