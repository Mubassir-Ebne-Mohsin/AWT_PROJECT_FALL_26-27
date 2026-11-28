"use client";
import type { AdminUser, DirectoryRole } from "@/lib/api/admin";
import { ROLE_LABEL } from "@/lib/roles-presentation";
import { adminErrorText, statusLabel } from "@/lib/admin-presentation";
import { dateText } from "@/lib/report-presentation";
const roles: DirectoryRole[] = ["instructor", "support", "admin"];
export function RoleDirectoryTable(props: {
  items: AdminUser[];
  role: DirectoryRole | "";
  onRole: (v: DirectoryRole | "") => void;
  selected: string | null;
  pending: boolean;
  error: unknown;
  fetching: boolean;
  more: boolean;
  loadingMore: boolean;
  onRefresh: () => void;
  onMore: () => void;
  onManage: (id: string) => void;
}) {
  return (
    <section className="admin-directory" aria-label="Role holders">
      <div className="admin-directory-heading">
        <div>
          <span className="eyebrow">ACCESS DIRECTORY</span>
          <h2 className="h2">Role holders</h2>
          <p>
            Accounts assigned Instructor, Support or Admin roles. An account with
            several roles appears once.
          </p>
        </div>
        <button
          className="btn"
          type="button"
          disabled={props.fetching}
          onClick={props.onRefresh}
        >
          {props.fetching ? "Refreshing…" : "Refresh role holders"}
        </button>
      </div>
      <div className="admin-directory-toolbar">
        <div
          className="admin-role-filters"
          role="group"
          aria-label="Filter role holders"
        >
          <button
            className="admin-role-filter"
            type="button"
            aria-pressed={props.role === ""}
            onClick={() => props.onRole("")}
          >
            All role holders
          </button>
          {roles.map((role) => (
            <button
              className="admin-role-filter"
              type="button"
              key={role}
              aria-pressed={props.role === role}
              onClick={() => props.onRole(role)}
            >
              {ROLE_LABEL[role]}
            </button>
          ))}
        </div>
        <span className="hint" role="status">
          {props.pending
            ? "Loading accounts…"
            : props.error
              ? "Directory unavailable"
              : `${props.items.length} accounts loaded${props.more ? " · more available" : ""}`}
        </span>
      </div>
      {props.error ? (
        <div className="admin-directory-message" role="alert">
          <p>{adminErrorText(props.error)}</p>
          <button className="btn" onClick={props.onRefresh} type="button">
            Retry role holders
          </button>
        </div>
      ) : props.pending ? (
        <p className="admin-directory-message" role="status">
          Loading role holders…
        </p>
      ) : props.items.length === 0 ? (
        <div className="admin-directory-message">
          <h3 className="h3">No matching role holders</h3>
          <p>Use Find an account below to give an existing account a role.</p>
        </div>
      ) : (
        <div
          className="admin-directory-scroll"
          role="region"
          aria-label="Role-holder accounts table"
          tabIndex={0}
        >
          <table className="admin-directory-table">
            <caption className="sr-only">
              Accounts holding Instructor, Support or Admin roles
            </caption>
            <thead>
              <tr>
                <th scope="col">Account</th>
                <th scope="col">Roles</th>
                <th scope="col">Status</th>
                <th scope="col">Joined</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {props.items.map((u) => (
                <tr key={u.id} data-selected={u.id === props.selected}>
                  <td>
                    <div className="admin-directory-person">
                      <span
                        className="admin-directory-avatar"
                        aria-hidden="true"
                      >
                        {u.displayName
                          .trim()
                          .split(/\s+/)
                          .map((v) => v[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase() || "?"}
                      </span>
                      <span>
                        <strong>{u.displayName}</strong>
                        <span className="admin-directory-email">{u.email}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className="admin-directory-roles">
                      {u.roles
                        .filter((r) => r !== "user")
                        .map((role) => (
                          <span
                            className="admin-directory-badge"
                            data-role={role}
                            key={role}
                          >
                            {ROLE_LABEL[role]}
                          </span>
                        ))}
                    </div>
                  </td>
                  <td>
                    <span className={"admin-directory-status " + u.status}>
                      <span aria-hidden="true" />
                      {statusLabel(u.status)}
                    </span>
                  </td>
                  <td className="admin-directory-date">
                    {dateText(u.createdAt)}
                  </td>
                  <td>
                    <button
                      className="btn btn-sm"
                      type="button"
                      aria-label={`Manage ${u.displayName}`}
                      aria-controls="admin-account-panel"
                      onClick={() => props.onManage(u.id)}
                    >
                      Manage <span aria-hidden="true">→</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!props.error && !props.pending && props.more && (
        <div className="admin-directory-footer">
          <button
            className="btn"
            disabled={props.loadingMore}
            type="button"
            onClick={props.onMore}
          >
            {props.loadingMore ? "Loading more…" : "Load more role holders"}
          </button>
        </div>
      )}
    </section>
  );
}
