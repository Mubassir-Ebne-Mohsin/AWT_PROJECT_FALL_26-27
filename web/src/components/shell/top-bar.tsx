"use client";

import Link from "next/link";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ThemeSelect } from "@/components/shell/theme-select";
import { initialsOf, useAuth } from "@/components/auth/auth-provider";
import { useMyRoles } from "@/components/auth/use-my-roles";
import { extraRoleText } from "@/lib/roles-presentation";
import { useUi } from "@/components/shell/ui-provider";
import { BrandMark, Icon, cx } from "@/components/ui/icon";
import { sectionOf } from "@/lib/routes";

const USER_NAV: Array<[string, string]> = [
  ["/dashboard", "Dashboard"],
  ["/designs", "Designs"],
  ["/templates", "Templates"],
  ["/learn", "Learn"],
  ["/challenges", "Challenges"],
  ["/evaluation/simulator", "Evaluation"],
];
const PUBLIC_NAV: Array<[string, string]> = [
  ["/examples", "Examples"],
  ["/how-it-works", "How it works"],
  ["/learn", "Learn"],
  ["/challenges", "Challenges"],
  ["/about", "About"],
];

/** Mounted only while the account menu is open, so the roles are read when someone looks, not on every page. */
function AccountRoleLine() {
  const { roles } = useMyRoles();
  const extra = extraRoleText(roles);
  if (!extra) return null;
  return (
    <div className="small" data-testid="account-roles">
      {extra}
    </div>
  );
}

/** Reviewers get a way in to the designs shared with them; everyone else sees no extra menu item. */
function ReviewerLink({ onNavigate }: { onNavigate: () => void }) {
  const { roles } = useMyRoles();
  if (!roles.includes("reviewer")) return null;
  return (
    <Link href="/reviews" role="menuitem" onClick={onNavigate}>
      <Icon n="msg" /> Shared with me
    </Link>
  );
}

/** Everyone signed in can follow their own reports; Support also gets the inbox. Nobody else sees the inbox link. */
function ReportLinks({ onNavigate }: { onNavigate: () => void }) {
  const { roles } = useMyRoles();
  return (
    <>
      <Link href="/reports" role="menuitem" onClick={onNavigate}>
        <Icon n="msg" /> My reports
      </Link>
      {roles.includes("support") && (
        <Link href="/support" role="menuitem" onClick={onNavigate}>
          <Icon n="wrench" /> Support inbox
        </Link>
      )}
    </>
  );
}

/** Admins get a way in to the dashboard and to account tools; everyone else sees no extra menu items. */
function AdminLinks({ onNavigate }: { onNavigate: () => void }) {
  const { roles } = useMyRoles();
  if (!roles.includes("admin")) return null;
  return (
    <>
      <Link href="/admin/dashboard" role="menuitem" onClick={onNavigate}>
        <Icon n="gauge" /> Live dashboard
      </Link>
      <Link href="/admin/users" role="menuitem" onClick={onNavigate}>
        <Icon n="user" /> Accounts and roles
      </Link>
    </>
  );
}

/** Instructors get a way in to their challenges; everyone else sees no extra menu item. */
function InstructorLink({ onNavigate }: { onNavigate: () => void }) {
  const { roles } = useMyRoles();
  if (!roles.includes("instructor")) return null;
  return (
    <Link href="/instructor/challenges" role="menuitem" onClick={onNavigate}>
      <Icon n="flag" /> My challenges
    </Link>
  );
}

export function TopBar({ pathname }: { pathname: string }) {
  const { ui, setUI } = useUi();
  const { user, status, signOut } = useAuth();
  const authed = status === "authed" && user;
  const nav = authed ? USER_NAV : PUBLIC_NAV;
  const isCurrent = (to: string) => sectionOf(pathname) === sectionOf(to);
  const close = { navMenu: false, userMenu: false };

  return (
    <header className="topbar">
      <div className="menu-wrap only-narrow">
        <button
          className="btn btn-ghost icon"
          aria-label="Open navigation"
          aria-expanded={ui.navMenu}
          onClick={() => setUI({ navMenu: !ui.navMenu, userMenu: false })}
        >
          <Icon n="menu" />
        </button>
        {ui.navMenu && (
          <div className="menu left" role="menu">
            {nav.map(([to, label]) => (
              <Link key={to} href={to} role="menuitem" aria-current={isCurrent(to) ? "page" : undefined} onClick={() => setUI(close)}>
                {label}
              </Link>
            ))}
            {authed && (
              <>
                <div className="sep" />
                <Link href="/new" role="menuitem" onClick={() => setUI(close)}>
                  <Icon n="plus" /> New design
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      <Link href={authed ? "/dashboard" : "/"} className="brand" title="StressForge">
        <span className="brand-mark">
          <BrandMark s={17} />
        </span>
        <span className="brand-word">
          <b>STRESSFORGE</b>
        </span>
      </Link>

      <nav className="nav full" aria-label="Main">
        {nav.map(([to, label]) => (
          <Link key={to} href={to} aria-current={isCurrent(to) ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </nav>

      <div className="topbar-right">
        <button className="search-btn" onClick={() => setUI({ palette: true })} aria-label="Search and jump to a screen (Ctrl+K)">
          <Icon n="search" s={15} />
          <span className="grow">Jump to…</span>
          <kbd>Ctrl K</kbd>
        </button>
        {authed && (
          <Link href="/new" className="btn btn-primary btn-sm hide-sm">
            <Icon n="plus" s={14} /> New design
          </Link>
        )}
        {authed && (
          <button
            className={cx("btn btn-ghost icon", ui.ai && "is-on")}
            aria-label="AI assistant"
            aria-pressed={ui.ai}
            title="AI assistant (.)"
            onClick={() => setUI({ ai: !ui.ai, help: false })}
            style={ui.ai ? { color: "var(--accent)", background: "var(--accent-soft)" } : undefined}
          >
            <Icon n="sparkle" />
          </button>
        )}
        <button
          className="btn btn-ghost icon"
          aria-label="Help for this screen"
          aria-pressed={ui.help}
          title="Help"
          onClick={() => setUI({ help: !ui.help, ai: false })}
          style={ui.help ? { color: "var(--accent)", background: "var(--accent-soft)" } : undefined}
        >
          <Icon n="help" />
        </button>
        <button className="btn btn-ghost icon hide-sm" aria-label="Report a problem" title="Report a problem or send feedback" onClick={() => setUI({ feedback: true, reportRef: null })}>
          <Icon n="msg" />
        </button>
        {authed && <NotificationBell pathname={pathname} />}
        <ThemeSelect />

        {authed ? (
          <div className="menu-wrap">
            <button
              className="avatar"
              aria-label="Account menu"
              aria-expanded={ui.userMenu}
              aria-haspopup="menu"
              onClick={() => setUI({ userMenu: !ui.userMenu, navMenu: false })}
            >
              {initialsOf(user.displayName)}
            </button>
            {ui.userMenu && (
              <div className="menu" role="menu">
                <div className="mh">
                  <div style={{ fontWeight: 650 }}>{user.displayName}</div>
                  <div className="muted small">{user.email}</div>
                  <AccountRoleLine />
                </div>
                <div className="sep" />
                <Link href="/dashboard" role="menuitem" onClick={() => setUI(close)}>
                  <Icon n="dashboard" /> Dashboard
                </Link>
                <Link href="/progress" role="menuitem" onClick={() => setUI(close)}>
                  <Icon n="flag" /> Progress
                </Link>
                <ReviewerLink onNavigate={() => setUI(close)} />
                <InstructorLink onNavigate={() => setUI(close)} />
                <AdminLinks onNavigate={() => setUI(close)} />
                <ReportLinks onNavigate={() => setUI(close)} />
                <Link href="/settings/profile" role="menuitem" onClick={() => setUI(close)}>
                  <Icon n="settings" /> Settings
                </Link>
                <button className="mi" role="menuitem" onClick={() => setUI({ shortcuts: true, userMenu: false })}>
                  <Icon n="keyboard" /> Keyboard shortcuts
                </button>
                <div className="sep" />
                <button
                  className="mi"
                  role="menuitem"
                  onClick={() => {
                    setUI(close);
                    void signOut();
                  }}
                >
                  <Icon n="logout" /> Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <Link href="/login" className="btn btn-ghost btn-sm">
              Log in
            </Link>
            <Link href="/register" className="btn btn-primary btn-sm hide-sm">
              Sign up
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
