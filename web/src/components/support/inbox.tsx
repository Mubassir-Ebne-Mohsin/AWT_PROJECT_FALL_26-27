"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { RoleGate } from "@/components/auth/role-gate";
import { Crumbs } from "@/components/shell/crumbs";
import { PriorityPill, StatusPill } from "@/components/support/parts";
import { listInbox, listSupportAgents } from "@/lib/api/support";
import { resolveRoute } from "@/lib/routes";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL_SUPPORT,
  ageTone,
  emptyFilters,
  hasFilters,
  sinceText,
  supportErrorText,
  type InboxFilters,
} from "@/lib/support";

/** The list refreshes by itself every 20 seconds while the tab is showing, so a new report appears without a reload. */
const REFRESH_MS = 20_000;
const SEARCH_DELAY_MS = 350;

export function SupportInbox() {
  return (
    <div className="page stack lg">
      <Crumbs resolved={resolveRoute("/support")} />
      <div className="page-head">
        <div className="stack">
          <span className="eyebrow">Support</span>
          <h1 className="h1">Support inbox</h1>
          <p className="lede">Every problem report. You see what people wrote and chose to send, never their designs.</p>
        </div>
      </div>
      <RoleGate role="support">
        <Inbox />
      </RoleGate>
    </div>
  );
}

function Inbox() {
  const { user } = useAuth();
  const [filters, setFilters] = useState<InboxFilters>(emptyFilters);
  const [typed, setTyped] = useState("");
  // The search is sent a moment after typing stops, not on every key.
  useEffect(() => {
    const id = setTimeout(() => setFilters((f) => (f.q === typed ? f : { ...f, q: typed })), SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [typed]);

  const agents = useQuery({ queryKey: ["support-agents", user?.id], queryFn: ({ signal }) => listSupportAgents(signal), enabled: !!user, retry: false, staleTime: 60_000 });
  const page = useInfiniteQuery({
    queryKey: ["support-inbox", user?.id, filters],
    queryFn: ({ pageParam, signal }) => listInbox(filters, pageParam ?? undefined, signal),
    initialPageParam: null as { at: string; id: string } | null,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: !!user,
    retry: false,
    refetchInterval: REFRESH_MS,
  });
  const set = (patch: Partial<InboxFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const items = page.data?.pages.flatMap((p) => p.items) ?? [];
  const now = Date.now();
  const unreadCount = items.filter((i) => i.unread).length;

  return (
    <div className="stack lg">
      <form className="panel rp-filters" role="search" aria-label="Filter reports" onSubmit={(e) => e.preventDefault()}>
        <div className="field rp-filter-q">
          <label className="label" htmlFor="in-q">
            Search
          </label>
          <input id="in-q" className="input" type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Words, or a reference such as SF-1042" maxLength={100} data-testid="inbox-search" />
        </div>
        <Select id="in-status" label="Status" value={filters.status} onChange={(v) => set({ status: v as InboxFilters["status"] })} options={STATUSES.map((s) => [s, STATUS_LABEL_SUPPORT[s]])} />
        <Select id="in-cat" label="Category" value={filters.category} onChange={(v) => set({ category: v as InboxFilters["category"] })} options={CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]])} />
        <Select id="in-pri" label="Priority" value={filters.priority} onChange={(v) => set({ priority: v as InboxFilters["priority"] })} options={PRIORITIES.map((p) => [p, PRIORITY_LABEL[p]])} />
        <Select
          id="in-owner"
          label="Owner"
          value={filters.assignee}
          onChange={(v) => set({ assignee: v })}
          options={[["me", "Me"], ["none", "Unassigned"], ...(agents.data ?? []).filter((a) => a.id !== user?.id).map((a) => [a.id, a.displayName] as [string, string])]}
        />
        <label className="row tight rp-unread">
          <input type="checkbox" checked={filters.unread} onChange={(e) => set({ unread: e.target.checked })} data-testid="inbox-unread" /> Unread only
        </label>
        {(hasFilters(filters) || typed) && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setFilters(emptyFilters());
              setTyped("");
            }}
            data-testid="inbox-clear"
          >
            Clear filters
          </button>
        )}
      </form>

      {page.isPending ? (
        <p className="muted" role="status">
          Loading reports…
        </p>
      ) : page.isError ? (
        <div className="note fail" role="alert" data-testid="inbox-error">
          <span>{supportErrorText(page.error)}</span>
          <button className="btn btn-sm" onClick={() => void page.refetch()}>
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="empty panel" data-testid="inbox-empty">
          <h2 className="h3">{hasFilters(filters) ? "No report matches these filters" : "No reports yet"}</h2>
          <p className="muted">{hasFilters(filters) ? "Try fewer filters or a different search." : "When someone reports a problem, it appears here."}</p>
        </div>
      ) : (
        <div className="panel">
          <div className="panel-h">
            <h2 className="h3">
              {items.length}
              {page.hasNextPage ? "+" : ""} {items.length === 1 && !page.hasNextPage ? "report" : "reports"}
            </h2>
            <span className="small muted" data-testid="inbox-unread-count">
              {unreadCount} unread
            </span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl rp-table" data-testid="inbox-table">
              <thead>
                <tr>
                  <th scope="col">Ref</th>
                  <th scope="col">Report</th>
                  <th className="rp-wide-only" scope="col">Status</th>
                  <th className="rp-wide-only" scope="col">Priority</th>
                  <th className="rp-wide-only" scope="col">Waiting</th>
                  <th className="rp-wide-only" scope="col">Owner</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => {
                  const tone = ageTone(i.createdAt, i.status, now);
                  return (
                    <tr key={i.id} data-testid="inbox-row" data-unread={i.unread ? "true" : "false"}>
                      <td className="rp-ref">{i.code}</td>
                      <td>
                        <Link href={`/support/${i.id}`} prefetch={false} className={`rp-title-link${i.unread ? " unread" : ""}`} data-testid="inbox-title">
                          {i.unread && <span className="rp-dot" aria-label="Unread" role="img" />}
                          {i.title}
                        </Link>
                        <div className="small muted">
                          {CATEGORY_LABEL[i.category]} · {i.authorName ?? "Deleted account"}
                        </div>
                        {/* On a phone the extra columns are hidden and these carry the same facts under the title. */}
                        <div className="rp-meta rp-narrow-only">
                          <StatusPill status={i.status} labels={STATUS_LABEL_SUPPORT} testId="status-pill-narrow" />
                          <PriorityPill priority={i.priority} testId="priority-pill-narrow" />
                          <span className={`pill ${tone === "ok" ? "outline" : tone}`} data-tone={tone}>
                            {sinceText(i.createdAt, now)}
                          </span>
                          <span className="small muted">{i.assigneeName ?? "Unassigned"}</span>
                        </div>
                      </td>
                      <td className="rp-wide-only">
                        <StatusPill status={i.status} labels={STATUS_LABEL_SUPPORT} />
                      </td>
                      <td className="rp-wide-only">
                        <PriorityPill priority={i.priority} />
                      </td>
                      <td className="rp-wide-only">
                        <span className={`pill ${tone === "ok" ? "outline" : tone}`} data-testid="age-badge" data-tone={tone}>
                          {sinceText(i.createdAt, now)}
                        </span>
                      </td>
                      <td className="rp-wide-only">{i.assigneeName ?? <span className="muted">Unassigned</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {page.hasNextPage && (
            <div className="panel-f">
              <button className="btn btn-sm" onClick={() => void page.fetchNextPage()} disabled={page.isFetchingNextPage} data-testid="inbox-more">
                {page.isFetchingNextPage ? "Loading…" : "Show more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Select({ id, label, value, onChange, options }: { id: string; label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="select sm" value={value} onChange={(e) => onChange(e.target.value)} data-testid={id}>
        <option value="">Any</option>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}
