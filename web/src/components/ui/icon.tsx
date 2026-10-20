import type { CSSProperties } from "react";
import { ICONS } from "@/components/ui/icon-data";

interface IconProps {
  n: string;
  s?: number;
  className?: string;
  style?: CSSProperties;
}

/** Line icon from the prototype's set. The markup is a static string, never user input. */
export function Icon({ n, s = 16, className, style }: IconProps) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[n] ?? "" }}
    />
  );
}

/** A stress–strain curve that rises, yields and fractures. */
export function BrandMark({ s = 16 }: { s?: number }) {
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 20 8 9c1.2-2.6 3-4 5-4s3.2 1.3 4.2 3.2l1.1 2.3" />
      <path d="m18.3 10.5 1.4 2.6-1.6 1.5 2.4 3.4" />
    </svg>
  );
}

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");
