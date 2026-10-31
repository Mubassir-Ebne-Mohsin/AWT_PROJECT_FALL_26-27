"use client";

import { useId, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { RoleGate } from "@/components/auth/role-gate";
import { Crumbs } from "@/components/shell/crumbs";
import { AUDIT_PAGE, fetchAudit, grantRole, restoreUser, revokeRole, searchUsers, suspendUser, type AdminUser, type GrantableRole } from "@/lib/api/admin";
import { MIN_SEARCH, adminErrorText, auditText, canSearch, searchTerm, statusLabel } from "@/lib/admin-presentation";
import { dateText } from "@/lib/report-presentation";
import { resolveRoute } from "@/lib/routes";
import { ROLE_LABEL } from "@/lib/roles-presentation";

const GRANTABLE: GrantableRole[] = ["instructor", "reviewer", "admin"];
type Notice = { ok: boolean; text: string } | null;

export function AdminUsers() {
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute("/admin/users")} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Admin</span>
          <h1 className="h1">Accounts and roles</h1>
          <p className="lede">Find an account, change its roles, or suspend it. You see account details only, never anyone&apos;s designs.</p>
        </div>
      </div>
      <RoleGate role="admin">
        <AdminTools />
      </RoleGate>
    </div>
  );
}

function AdminTools() {
  const { user: me } = useAuth();
  const queries = useQueryClient();
  const uid = useId();
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const found = useQuery({ queryKey: ["admin-users", me?.id, term], queryFn: ({ signal }) => searchUsers(term, signal), enabled: !!me && term.length >= MIN_SEARCH, retry: false });
  const audit = useInfiniteQuery({
    queryKey: ["admin-audit", me?.id],
    queryFn: ({ pageParam, signal }) => fetchAudit(pageParam ?? undefined, signal),
    initialPageParam: null as { at: string; id: string } | null,
    getNextPageParam: (last) => (last.length < AUDIT_PAGE ? undefined : { at: last[last.length - 1].at, id: last[last.length - 1].id }),
    enabled: !!me,
    retry: false,
  });

  const account = (found.data ?? []).find((u) => u.id === selected) ?? null;
  const refresh = () => {
    setConfirming(null);
    void queries.invalidateQueries({ queryKey: ["admin-users", me?.id] });
    void queries.invalidateQueries({ queryKey: ["admin-audit", me?.id] });
  };
  const done = (message: string) => {
    setNotice({ ok: true, text: message });
    refresh();
  };
  const failed = (e: unknown) => {
    setConfirming(null);
    setNotice({ ok: false, text: adminErrorText(e) });
  };

  const grant = useMutation({ mutationFn: (v: { id: string; role: GrantableRole }) => grantRole(v.id, v.role), onSuccess: (_d, v) => done(`${ROLE_LABEL[v.role]} role given.`), onError: failed });
  const revoke = useMutation({
    mutationFn: (v: { id: string; role: GrantableRole }) => revokeRole(v.id, v.role),
    onSuccess: (_d, v) => done(`${ROLE_LABEL[v.role]} role removed. Their sessions ended, so they sign in again.`),
    onError: failed,
  });
  const suspend = useMutation({ mutationFn: (id: string) => suspendUser(id), onSuccess: () => done("Account suspended. They are signed out and cannot sign in."), onError: failed });
  const restore = useMutation({ mutationFn: (id: string) => restoreUser(id), onSuccess: () => done("Account restored. They can sign in again."), onError: failed });
  const busy = grant.isPending || revoke.isPending || suspend.isPending || restore.isPending;

  const entries = (audit.data?.pages ?? []).flat();

  return (
    <>
      <form
        className="panel stack r2-pad"
        aria-label="Find an account"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSearch(text)) return;
          setTerm(searchTerm(text));
          setSelected(null);
          setNotice(null);
        }}
      >
        <h2 className="h3">Find an account</h2>
        <div className="m15-field">
          <label htmlFor={uid + "q"}>Email or name</label>
          <input id={uid + "q"} className="r2-input" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
          <span className="hint">Type at least {MIN_SEARCH} characters. Part of an email or name is enough.</span>
        </div>
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={!canSearch(text)}>
            Search
          </button>
        </div>
      </form>

      {notice && (
        <p className={notice.ok ? "hint" : "m16-warn"} role={notice.ok ? "status" : "alert"} data-testid="admin-notice">
          {notice.text}
        </p>
      )}

      {term && (
        <section className="panel stack r2-pad" aria-label="Search results">
          <h2 className="h3">Results</h2>
          {found.isPending && <p className="hint">Searching…</p>}
          {found.isError && (
            <p className="m16-warn" role="alert">
              {adminErrorText(found.error)}
            </p>
          )}
          {found.data && found.data.length === 0 && <p className="hint">No account matches that.</p>}
          {found.data && found.data.length > 0 && (
            <ul className="r2-list">
              {found.data.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className={"r2-row" + (u.id === selected ? " is-on" : "")}
                    aria-pressed={u.id === selected}
                    onClick={() => {
                      setSelected(u.id);
                      setConfirming(null);
                      setNotice(null);
                    }}
                  >
                    <span>
                      <strong>{u.displayName}</strong> <span className="muted">{u.email}</span>
                    </span>
                    <span className={"pill" + (u.status === "suspended" ? " fail" : " ok")}>{statusLabel(u.status)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {account && (
        <AccountPanel
          key={account.id}
          account={account}
          isMe={account.id === me?.id}
          busy={busy}
          confirming={confirming}
          setConfirming={setConfirming}
          onGrant={(role) => grant.mutate({ id: account.id, role })}
          onRevoke={(role) => revoke.mutate({ id: account.id, role })}
          onSuspend={() => suspend.mutate(account.id)}
          onRestore={() => restore.mutate(account.id)}
        />
      )}

      <section className="panel stack r2-pad" aria-label="Audit log" data-testid="admin-audit">
        <h2 className="h3">Audit log</h2>
        <p className="hint">Every role change and suspension, newest first. Nobody can edit or delete an entry.</p>
        {audit.isPending && <p className="hint">Loading…</p>}
        {audit.isError && (
          <p className="m16-warn" role="alert">
            {adminErrorText(audit.error)}
          </p>
        )}
        {audit.data && entries.length === 0 && <p className="hint">Nothing has been changed yet.</p>}
        {entries.length > 0 && (
          <ul className="r2-list">
            {entries.map((e) => (
              <li key={e.id} className="r2-audit">
                <span>{auditText(e)}</span>
                <span className="muted small">{dateText(e.at)}</span>
              </li>
            ))}
          </ul>
        )}
        {audit.hasNextPage && (
          <div className="row">
            <button className="btn" type="button" onClick={() => void audit.fetchNextPage()} disabled={audit.isFetchingNextPage}>
              {audit.isFetchingNextPage ? "Loading…" : "Show older"}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function AccountPanel(props: {
  account: AdminUser;
  isMe: boolean;
  busy: boolean;
  confirming: string | null;
  setConfirming: (key: string | null) => void;
  onGrant: (role: GrantableRole) => void;
  onRevoke: (role: GrantableRole) => void;
  onSuspend: () => void;
  onRestore: () => void;
}) {
  const { account, isMe, busy, confirming, setConfirming } = props;
  const suspended = account.status === "suspended";
  return (
    <section className="panel stack r2-pad" aria-label={`Account ${account.email}`} data-testid="admin-account">
      <div className="row between">
        <div className="stack">
          <h2 className="h3">{account.displayName}</h2>
          <span className="muted">{account.email}</span>
          <span className="muted small">Joined {dateText(account.createdAt)}</span>
        </div>
        <span className={"pill" + (suspended ? " fail" : " ok")}>{statusLabel(account.status)}</span>
      </div>

      <div className="stack">
        <h3 className="h4">Roles</h3>
        <p className="hint">Every account is a User. Roles do not include each other: an Admin is not automatically a Reviewer.</p>
        <ul className="r2-list">
          {GRANTABLE.map((role) => {
            const held = account.roles.includes(role);
            const key = "revoke:" + role;
            return (
              <li key={role} className="r2-audit" data-testid={`role-${role}`}>
                <span>
                  <strong>{ROLE_LABEL[role]}</strong> <span className="muted">{held ? "held" : "not held"}</span>
                </span>
                {!held && (
                  <button className="btn btn-sm" type="button" disabled={busy} onClick={() => props.onGrant(role)} aria-label={`Give ${ROLE_LABEL[role]} role`}>
                    Give
                  </button>
                )}
                {held && confirming !== key && (
                  <button className="btn btn-sm" type="button" disabled={busy} onClick={() => setConfirming(key)} aria-label={`Remove ${ROLE_LABEL[role]} role`}>
                    Remove
                  </button>
                )}
                {held && confirming === key && (
                  <span className="row tight">
                    <button className="btn btn-sm btn-danger" type="button" disabled={busy} onClick={() => props.onRevoke(role)}>
                      Confirm remove {ROLE_LABEL[role]}
                    </button>
                    <button className="btn btn-sm" type="button" onClick={() => setConfirming(null)}>
                      Cancel
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="stack">
        <h3 className="h4">Account status</h3>
        <p className="hint">Suspending signs the account out and blocks sign-in. Nothing is deleted, and you can restore it.</p>
        {isMe && !suspended && <p className="hint">This is your own account, so it cannot be suspended here.</p>}
        {!suspended && !isMe && confirming !== "suspend" && (
          <div className="row">
            <button className="btn" type="button" disabled={busy} onClick={() => setConfirming("suspend")}>
              Suspend account
            </button>
          </div>
        )}
        {!suspended && !isMe && confirming === "suspend" && (
          <div className="row">
            <button className="btn btn-danger" type="button" disabled={busy} onClick={props.onSuspend}>
              Confirm suspend
            </button>
            <button className="btn" type="button" onClick={() => setConfirming(null)}>
              Cancel
            </button>
          </div>
        )}
        {suspended && (
          <div className="row">
            <button className="btn btn-primary" type="button" disabled={busy} onClick={props.onRestore}>
              Restore account
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
