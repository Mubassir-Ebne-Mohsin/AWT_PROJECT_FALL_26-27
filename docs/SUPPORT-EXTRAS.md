# Support saved replies and duplicate reports — roadmap E

## Before using the updated API

This feature adds `SupportExtras1794900000000`. Audit work migrates disposable databases only. Stop your backend, keep Docker/Postgres running, then use PowerShell:

```powershell
Set-Location "C:\ADVANCED WEB TECH\AWT_PROJECT_FALL_26-27\STRESSFORGE\nest-boilerplate\nest-boilerplate"
pnpm migration:run
pnpm start:dev
```

Refresh the frontend. No new package, key, AI call or frontend route. Existing databases need the migration before using the updated Support/report/export endpoints.

## Saved replies

1. Sign in with Support, open a report in **Support inbox**, and expand **Saved replies** above the reply box.
2. Enter a title/body and choose Personal or Team, then **Create saved reply**. Personal answers are available only to their owner (50 per account). Team answers are available to Support, who can also edit/delete them (100 total).
3. Use `{name}` for this report's author display name and `{code}` for its reference. Unknown placeholders stay literal; inserted values are not expanded recursively. A deleted author becomes “there”. Plain text only, up to 4000 characters including expansion.
4. Choose an answer and press **Insert reply**. It appends to the current draft, including text typed while it was loading. It does **not** send. Review/edit the result, choose public reply or internal note as usual, then press the existing send button.
5. **Edit selected reply** loads an editable copy. Visibility cannot be changed during editing; create a separate copy to change scope. If another agent saved first, your changes remain in the form and the server refuses the stale save. Refresh the list, preserve any text you want, cancel editing and load the current answer before trying again.
6. **Delete selected reply** asks for confirmation; existing sent messages remain. Creator account deletion cascades their saved replies. Own personal replies are included in account export; team/other personal replies are not.

Create/edit/delete metadata goes to the existing append-only Support activity log. It records template UUID/action/actor/time, never template body/title. These entries have no ticket id/reference; ordinary ticket events still require both.

## Merge duplicates

1. Open the report to mark as a duplicate. Under **Duplicate reports**, search for the surviving report using its SF reference or title.
2. Choose it, review the references and privacy explanation, then **Confirm merge**. The duplicate becomes Resolved and receives an automatic “System:” message with the surviving reference. Its author receives the existing status notification. A system merge message does not count as a first human response.
3. Messages, names, technical context and internal notes are **never copied or combined**. Support uses the surviving report's linked conversation list to open each original thread separately.
4. A reporter can follow the surviving link. If they do not own that report, it resolves only their own most-recent linked conversation. They see their own original title/body/public replies, never the other reporter's content. If they own the survivor, they see that owned thread normally. Original report links remain readable.
5. Private follow-up messages remain in the original duplicate conversation; they do not reopen or expose the surviving thread. The duplicate stays Resolved while merged, with writing still available. Use the unread inbox/bell to follow these messages. Support must explicitly unmerge before reopening a duplicate.
6. **Unmerge and reopen**, after confirmation, clears the link, opens the duplicate, appends a fixed system message and logs the action. Fresh requests through the former alias stop working for the secondary reporter; their original conversation remains readable.

Self-merges, missing targets, merged targets, moving an already merged source, chains/cycles and merging a source that already has duplicates are refused. Several leaves may point to one survivor. Requests serialize topology changes and compare current source/target timestamps; stale proposals require refreshing the source and searching again. Database guards enforce topology and the Resolved state too.

All new APIs require Support permission (Admin alone is insufficient). Reporter access remains derived from their own report author id. Merge/message/audit/status notification updates commit together or roll back together. Network errors do not trigger automatic retry: refresh first because a request may already have completed.

## Maintenance and limits

No global/shared conversation, automatic reply sending, design-consent access, gallery or AI work is part of E. The new migration adds one table/one nullable reference column and adapts the existing audit constraints for template metadata. Down refuses saved replies, live links or retained new audit history; it never deletes history to force rollback.

[Scope/decisions](SUPPORT-EXTRAS-SCOPE.md) · [Verification](audit/support-e-2026-11-07/README.md) · [Living report](STRESSFORGE-PROGRESS-REPORT.md). Future phase completion must update the same report, preserve history, record actual evidence and reassess affected earlier requirements; updates are not automatic.
