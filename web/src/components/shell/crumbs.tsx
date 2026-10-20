import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { crumbsFor, ResolvedRoute } from "@/lib/routes";

export function Crumbs({ resolved }: { resolved: ResolvedRoute }) {
  const list = crumbsFor(resolved);
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {list.map((c, i) => {
        const last = i === list.length - 1;
        return (
          <span key={`${c.label}-${i}`} style={{ display: "contents" }}>
            {i > 0 && <Icon n="chevR" s={12} />}
            {c.to && !last ? (
              <Link href={c.to}>{c.label}</Link>
            ) : (
              <span className={last ? "cur" : ""} aria-current={last ? "page" : undefined}>
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
