"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { Crumbs } from "@/components/shell/crumbs";
import { ApiError } from "@/lib/api/errors";
import { archiveDesign, duplicateDesign, fetchLibrary, LIBRARY_PAGE_SIZE, unarchiveDesign, type LibraryItem } from "@/lib/api/library";
import { DEFAULT_QUERY, isFiltered, paramsFromQuery, queryFromParams, resultLabel } from "@/lib/library-presentation";
import { resolveRoute } from "@/lib/routes";
import { workspaceHref } from "@/lib/run-links";

type Notice = { text: string; ok: boolean; undo?: { id: string; name: string } } | null;
type Action = { kind: "duplicate" | "archive" | "unarchive"; id: string; name: string };

function failureText(e: unknown) {
  if (e instanceof ApiError && e.status === 404) return "That design is no longer available.";
  if (e instanceof ApiError && e.code === "NETWORK") return "The server could not be reached. Nothing was changed.";
  return "That did not work. Nothing was changed.";
}

export function DesignsList() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const queries = useQueryClient();
  const query = queryFromParams(new URLSearchParams(params.toString()));
  const [text, setText] = useState(query.q);
  const [notice, setNotice] = useState<Notice>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const uid = useId();

  const go = (next: typeof query) => {
    const s = paramsFromQuery(next);
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  // Debounced search: typing never fires a request per keystroke and always restarts at page 1.
  useEffect(() => {
    if (text.trim() === query.q.trim()) return;
    const t = setTimeout(() => go({ ...query, q: text, page: 1 }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const list = useQuery({
    queryKey: ["library", user?.id, query],
    queryFn: ({ signal }) => fetchLibrary(query, signal),
    enabled: !!user,
    placeholderData: keepPreviousData,
  });

  const act = useMutation({
    mutationFn: async (a: Action) => {
      setBusyId(a.id);
      if (a.kind === "duplicate") await duplicateDesign(a.id);
      else if (a.kind === "archive") await archiveDesign(a.id);
      else await unarchiveDesign(a.id);
      return a;
    },
    onSuccess: (a) => {
      setNotice(
        a.kind === "duplicate"
          ? { ok: true, text: `Duplicated “${a.name}”. The copy is a new design.` }
          : a.kind === "archive"
            ? { ok: true, text: `Archived “${a.name}”. Its versions, results and notes are kept.`, undo: { id: a.id, name: a.name } }
            : { ok: true, text: `Restored “${a.name}” to your list.` },
      );
      void queries.invalidateQueries({ queryKey: ["library"] });
      void queries.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e) => setNotice({ ok: false, text: failureText(e) }),
    onSettled: () => setBusyId(null),
  });

  const data = list.data;
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
  const filtered = isFiltered(query);
  const run = (kind: Action["kind"], d: Pick<LibraryItem, "id" | "name">) => act.mutate({ kind, id: d.id, name: d.name });

  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute("/designs")} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Designs</span>
          <h1 className="h1">Designs</h1>
          <p className="lede">Search, sort and tidy every architecture you own.</p>
        </div>
        <Link className="btn btn-primary" href="/new">
          New design
        </Link>
      </div>

      <form className="m15-filters" role="search" aria-label="Filter designs" onSubmit={(e) => e.preventDefault()}>
        <div className="m15-field m15-grow">
          <label htmlFor={uid + "q"}>Search</label>
          <input id={uid + "q"} type="search" maxLength={100} value={text} placeholder="Name or description" onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="m15-field">
          <label htmlFor={uid + "s"}>Sort by</label>
          <select id={uid + "s"} value={query.sort} onChange={(e) => go({ ...query, sort: e.target.value as typeof query.sort, page: 1 })}>
            <option value="updated">Recently updated</option>
            <option value="name">Name</option>
            <option value="lastRun">Latest result</option>
          </select>
        </div>
        <div className="m15-field">
          <label htmlFor={uid + "v"}>Result</label>
          <select id={uid + "v"} value={query.verdict} onChange={(e) => go({ ...query, verdict: e.target.value as typeof query.verdict, page: 1 })}>
            <option value="">Any</option>
            <option value="pass">Passing</option>
            <option value="strained">Strained</option>
            <option value="fail">Missing target</option>
            <option value="none">No result yet</option>
          </select>
        </div>
        <div className="m15-field">
          <label htmlFor={uid + "a"}>Show</label>
          <select id={uid + "a"} value={query.archived} onChange={(e) => go({ ...query, archived: e.target.value as typeof query.archived, page: 1 })}>
            <option value="active">Active designs</option>
            <option value="archived">Archived only</option>
            <option value="all">All designs</option>
          </select>
        </div>
      </form>

      <div aria-live="polite" className="m15-live">
        {notice && (
          <p className={"hint " + (notice.ok ? "" : "m15-error")} role={notice.ok ? "status" : "alert"} data-testid="library-notice">
            {notice.text}{" "}
            {notice.undo && (
              <button className="btn" type="button" onClick={() => run("unarchive", notice.undo!)}>
                Undo
              </button>
            )}
          </p>
        )}
      </div>

      {list.isError && !data ? (
        <div className="panel stack" role="alert">
          <h2 className="h3">Designs could not be loaded</h2>
          <p className="hint">Nothing was changed. Check the connection and try again.</p>
          <button className="btn" type="button" onClick={() => void list.refetch()}>
            Try again
          </button>
        </div>
      ) : !data ? (
        <p className="hint" role="status">
          Loading designs…
        </p>
      ) : data.data.length === 0 ? (
        <div className="panel empty stack" data-testid="library-empty">
          {filtered ? (
            <>
              <h2 className="h3">No designs match</h2>
              <p className="hint">Try a different search or clear the filters.</p>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setText("");
                  go(DEFAULT_QUERY);
                }}
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
              <h2 className="h3">No designs yet</h2>
              <p className="hint">Start from a template or describe a system to get your first design.</p>
              <Link className="btn btn-primary" href="/new">
                New design
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="hint" data-testid="library-count">
            {total} {total === 1 ? "design" : "designs"}
            {filtered ? " match" : ""}
          </p>
          <ul className="m15-library" aria-label="Designs">
            {data.data.map((d) => {
              const r = resultLabel(d.latestRun, d.revision);
              const busy = busyId === d.id;
              return (
                <li key={d.id} className="panel m15-design" data-testid="library-item">
                  <div className="row m15-vh">
                    <h2 className="h4">
                      <Link href={workspaceHref(d.id, "edit")}>{d.name}</Link>
                    </h2>
                    {d.archivedAt && <span className="tag">Archived</span>}
                    <span className={"tag " + r.tone}>{r.label}</span>
                  </div>
                  {d.description && <p className="hint">{d.description}</p>}
                  <p className="hint">
                    Revision {d.revision} · {d.nodeCount} {d.nodeCount === 1 ? "component" : "components"} · {d.edgeCount}{" "}
                    {d.edgeCount === 1 ? "connection" : "connections"} · Updated <time dateTime={d.updatedAt}>{new Date(d.updatedAt).toLocaleDateString()}</time>
                  </p>
                  <div className="row m15-actions">
                    <Link className="btn" href={workspaceHref(d.id, "edit")}>
                      Open
                    </Link>
                    <button className="btn" type="button" disabled={busy} onClick={() => run("duplicate", d)}>
                      Duplicate
                    </button>
                    <button className="btn" type="button" disabled={busy} onClick={() => run(d.archivedAt ? "unarchive" : "archive", d)}>
                      {d.archivedAt ? "Unarchive" : "Archive"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <nav className="row m15-pager" aria-label="Pages">
              <button className="btn" type="button" disabled={query.page <= 1} onClick={() => go({ ...query, page: query.page - 1 })}>
                Previous
              </button>
              <span className="hint">
                Page {query.page} of {pages}
              </span>
              <button className="btn" type="button" disabled={query.page >= pages} onClick={() => go({ ...query, page: query.page + 1 })}>
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
