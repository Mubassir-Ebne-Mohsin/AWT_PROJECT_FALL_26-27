"use client";

import Link from "next/link";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { notFound, usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { useAuth } from "@/components/auth/auth-provider";
import { useMyRoles } from "@/components/auth/use-my-roles";
import { Crumbs } from "@/components/shell/crumbs";
import { changeDisplayName, changePassword, deleteAccount, exportAccount } from "@/lib/api/account";
import { SETTINGS_SECTIONS } from "@/lib/catalog";
import { hardNavigate } from "@/lib/navigation";
import { NOT_FOUND_ROUTE, resolveRoute } from "@/lib/routes";
import { extraRoleText } from "@/lib/roles-presentation";
import {
  DELETE_PHRASE,
  DISPLAY_NAME_MAX,
  PASSWORD_RULES,
  accountErrorText,
  canDelete,
  exportFileName,
  exportSummary,
  serverFields,
  validateDisplayName,
  validatePasswordChange,
  type FieldMap,
  type PasswordErrors,
} from "@/lib/settings-presentation";
import { dateText } from "@/lib/report-presentation";

type Notice = { ok: boolean; text: string } | null;

/** Account settings, one section per page. Everything here is about the signed-in account and nothing else. */
export function SettingsPage() {
  const pathname = usePathname();
  const resolved = resolveRoute(pathname);
  if (resolved.route === NOT_FOUND_ROUTE) notFound();
  const section = resolved.params.section;

  return (
    <div className="page stack lg" data-testid="settings-page">
      <Crumbs resolved={resolved} />
      <div className="stack">
        <h1 className="h1">Settings</h1>
        <p className="lede">Your account, your data and how the app looks on this device.</p>
      </div>
      <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 24 }}>
        <nav aria-label="Settings sections" style={{ minWidth: 180 }}>
          <ul className="r2-list">
            {Object.entries(SETTINGS_SECTIONS).map(([id, label]) => (
              <li key={id}>
                <Link className={"r2-row" + (id === section ? " is-on" : "")} href={`/settings/${id}`} aria-current={id === section ? "page" : undefined}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="stack" style={{ flex: "1 1 360px", minWidth: 0 }}>
          <h2 className="h2" data-testid="settings-heading">
            {SETTINGS_SECTIONS[section]}
          </h2>
          {section === "profile" && <Profile />}
          {section === "security" && <Security />}
          {section === "ai-usage" && <AiUsage />}
          {section === "data" && <Data />}
          {section === "appearance" && <Appearance />}
          {section === "preferences" && <Preferences />}
        </div>
      </div>
    </div>
  );
}

function Message({ notice, id }: { notice: Notice; id: string }) {
  if (!notice) return null;
  return (
    <p className={notice.ok ? "hint" : "m16-warn"} role={notice.ok ? "status" : "alert"} data-testid={id}>
      {notice.text}
    </p>
  );
}

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="m16-warn" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function Profile() {
  const { user } = useAuth();
  const { roles } = useMyRoles();
  const [name, setName] = useState(user?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  if (!user) return null;
  const extra = extraRoleText(roles);
  const unchanged = name.trim() === user.displayName;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const problem = validateDisplayName(name);
    setError(problem);
    setNotice(null);
    if (problem) return;
    setBusy(true);
    try {
      const saved = await changeDisplayName(name.trim());
      setName(saved.displayName);
      setNotice({ ok: true, text: "Saved. Your new name shows to Reviewers, Instructors and in share links you make." });
    } catch (err) {
      const fields = serverFields(err);
      if (fields.displayName) setError(fields.displayName);
      else setNotice({ ok: false, text: accountErrorText(err, "name") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack r2-pad" aria-label="Profile">
      <dl className="stack small">
        <div>
          <dt className="muted">Email</dt>
          <dd data-testid="profile-email">{user.email}</dd>
        </div>
        <div>
          <dt className="muted">Account type</dt>
          <dd>{extra ? `User, ${extra}` : "User"}</dd>
        </div>
        <div>
          <dt className="muted">Member since</dt>
          <dd>{dateText(user.createdAt)}</dd>
        </div>
      </dl>
      <p className="hint">Your email is how you sign in and cannot be changed here.</p>
      <form className="stack" onSubmit={save} noValidate aria-label="Change display name">
        <Field id="set-name" label="Display name" error={error ?? undefined} hint={`Plain text, up to ${DISPLAY_NAME_MAX} characters. Other people see this instead of your email.`}>
          <input id="set-name" className="r2-input" value={name} maxLength={DISPLAY_NAME_MAX * 2} aria-invalid={!!error} aria-describedby={error ? "set-name-error" : "set-name-hint"} onChange={(e) => setName(e.target.value)} autoComplete="nickname" />
        </Field>
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy || unchanged}>
            {busy ? "Saving…" : "Save name"}
          </button>
        </div>
        <Message notice={notice} id="profile-notice" />
      </form>
    </section>
  );
}

function Security() {
  const [v, setV] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const set = (key: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [key]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setNotice(null);
    const found = validatePasswordChange(v);
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      await changePassword(v.current, v.next);
      setV({ current: "", next: "", confirm: "" });
      setNotice({ ok: true, text: "Password changed. You stay signed in here; every other device has been signed out." });
    } catch (err) {
      const fields = serverFields(err);
      setErrors({ current: fields.currentPassword, next: fields.newPassword });
      if (!fields.currentPassword && !fields.newPassword) setNotice({ ok: false, text: accountErrorText(err, "password") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel stack r2-pad" aria-label="Security">
      <form className="stack" onSubmit={submit} noValidate aria-label="Change password">
        <h3 className="h3">Change password</h3>
        <Field id="set-pw-current" label="Current password" error={errors.current}>
          <input id="set-pw-current" className="r2-input" type="password" autoComplete="current-password" value={v.current} aria-invalid={!!errors.current} aria-describedby={errors.current ? "set-pw-current-error" : undefined} onChange={set("current")} />
        </Field>
        <Field id="set-pw-new" label="New password" error={errors.next} hint={PASSWORD_RULES}>
          <input id="set-pw-new" className="r2-input" type="password" autoComplete="new-password" value={v.next} aria-invalid={!!errors.next} aria-describedby={errors.next ? "set-pw-new-error" : "set-pw-new-hint"} onChange={set("next")} />
        </Field>
        <Field id="set-pw-confirm" label="Confirm new password" error={errors.confirm}>
          <input id="set-pw-confirm" className="r2-input" type="password" autoComplete="new-password" value={v.confirm} aria-invalid={!!errors.confirm} aria-describedby={errors.confirm ? "set-pw-confirm-error" : undefined} onChange={set("confirm")} />
        </Field>
        <p className="hint">Changing your password signs out every other device. This one stays signed in.</p>
        <div className="row">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? "Changing…" : "Change password"}
          </button>
        </div>
        <Message notice={notice} id="password-notice" />
      </form>
    </section>
  );
}

function AiUsage() {
  return (
    <section className="panel stack r2-pad" aria-label="AI usage">
      <p data-testid="ai-off">The AI features are switched off in this version, so there is nothing to use up and nothing is sent to any AI service.</p>
      <p className="hint">If AI is turned on in a later version, this page will show how much you have used.</p>
    </section>
  );
}

function Data() {
  const { user } = useAuth();
  const queries = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<Notice>(null);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [fields, setFields] = useState<FieldMap>({});
  const [deleteNotice, setDeleteNotice] = useState<Notice>(null);

  async function download() {
    if (exporting) return;
    setExporting(true);
    setExportNotice(null);
    try {
      const data = await exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(new Date());
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportNotice({ ok: true, text: exportSummary(data) });
    } catch (err) {
      setExportNotice({ ok: false, text: accountErrorText(err, "export") });
    } finally {
      setExporting(false);
    }
  }

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    if (deleting || !canDelete(password, typed)) return;
    setDeleting(true);
    setDeleteNotice(null);
    setFields({});
    try {
      await deleteAccount(password, typed);
      queries.clear();
      hardNavigate("/");
    } catch (err) {
      setFields(serverFields(err));
      setDeleteNotice({ ok: false, text: accountErrorText(err, "delete") });
      setDeleting(false);
    }
  }

  return (
    <>
      <section className="panel stack r2-pad" aria-label="Export">
        <h3 className="h3">Download your data</h3>
        <p>One file with your account details, designs with their versions, notes and results, share links (without their secrets), reviews of your designs, challenge work and feedback you received.</p>
        <p className="hint">It never includes other people&apos;s emails or your password. Results of older runs beyond the latest 20 per design are listed without their large result.</p>
        <div className="row">
          <button className="btn btn-primary" type="button" onClick={() => void download()} disabled={exporting} data-testid="export-button">
            {exporting ? "Preparing…" : "Download my data"}
          </button>
        </div>
        <Message notice={exportNotice} id="export-notice" />
      </section>

      <section className="panel stack r2-pad" aria-label="Delete account" data-testid="delete-section">
        <h3 className="h3">Delete your account</h3>
        <p>This cannot be undone. Deleting your account permanently removes:</p>
        <ul>
          <li>your designs, with their versions, notes, results and share links;</li>
          <li>reviews you shared, and your comments as a Reviewer;</li>
          <li>your challenge attempts and results, and challenges you wrote that nobody has attempted.</li>
        </ul>
        <p className="hint">
          A challenge that other people have attempted is kept, archived, so their results survive; your feedback on it will show as &quot;Former Instructor&quot;. The history of role changes is an audit log and is kept. Download your data first if you want a copy.
        </p>
        {!open ? (
          <div className="row">
            <button className="btn btn-danger" type="button" onClick={() => setOpen(true)} data-testid="delete-open">
              Delete my account…
            </button>
          </div>
        ) : (
          <form className="stack" onSubmit={remove} noValidate aria-label="Confirm account deletion">
            <Field id="set-del-pw" label="Your password" error={fields.password}>
              <input id="set-del-pw" className="r2-input" type="password" autoComplete="current-password" value={password} aria-invalid={!!fields.password} aria-describedby={fields.password ? "set-del-pw-error" : undefined} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field id="set-del-phrase" label={`Type "${DELETE_PHRASE}" to confirm`} error={fields.confirmation}>
              <input id="set-del-phrase" className="r2-input" autoComplete="off" value={typed} aria-invalid={!!fields.confirmation} aria-describedby={fields.confirmation ? "set-del-phrase-error" : undefined} onChange={(e) => setTyped(e.target.value)} />
            </Field>
            <p className="small muted">Signed in as {user?.email}.</p>
            <div className="row">
              <button className="btn btn-danger" type="submit" disabled={deleting || !canDelete(password, typed)} data-testid="delete-confirm">
                {deleting ? "Deleting…" : "Permanently delete my account"}
              </button>
              <button
                className="btn"
                type="button"
                disabled={deleting}
                onClick={() => {
                  setOpen(false);
                  setPassword("");
                  setTyped("");
                  setFields({});
                  setDeleteNotice(null);
                }}
              >
                Cancel
              </button>
            </div>
            <Message notice={deleteNotice} id="delete-notice" />
          </form>
        )}
      </section>
    </>
  );
}

const THEMES = [
  ["light", "Light"],
  ["dark", "Dark"],
  ["system", "Match my device"],
] as const;
const subscribe = () => () => {};

function Appearance() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, () => true, () => false);
  const current = mounted ? (theme ?? "system") : "system";
  return (
    <section className="panel stack r2-pad" aria-label="Appearance">
      <fieldset className="stack" style={{ border: 0, padding: 0 }}>
        <legend className="h3">Appearance theme</legend>
        {THEMES.map(([value, label]) => (
          <label key={value} className="row tight">
            <input type="radio" name="appearance-theme" value={value} checked={current === value} disabled={!mounted} onChange={() => setTheme(value)} /> {label}
          </label>
        ))}
      </fieldset>
      <p className="hint">Saved on this device only. It is not part of your account.</p>
    </section>
  );
}

function Preferences() {
  return <NotificationPreferences />;
}
