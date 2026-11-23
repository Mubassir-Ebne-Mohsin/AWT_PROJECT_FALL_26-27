"use client";

import { useEffect, useId, useState } from "react";
import { checkUsername } from "@/lib/api/auth";
import { usernameSchema } from "@/lib/validation/auth";

type Availability = "available" | "taken" | "unavailable";

export function UsernameField({
  value, onChange, error, disabled, optional = false, current,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled: boolean;
  optional?: boolean;
  current?: string;
}) {
  const id = useId();
  const [result, setResult] = useState<{ username: string; status: Availability }>();
  const parsed = usernameSchema.safeParse(value);
  const username = parsed.success && parsed.data !== current ? parsed.data : undefined;

  useEffect(() => {
    if (!username || disabled) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { available } = await checkUsername(username, controller.signal);
        if (!controller.signal.aborted) setResult({ username, status: available ? "available" : "taken" });
      } catch {
        if (!controller.signal.aborted) setResult({ username, status: "unavailable" });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [username, disabled]);

  const status = result?.username === username ? result?.status : undefined;
  const validation = value.trim() && !parsed.success ? parsed.error.issues[0]?.message : undefined;
  const problem = error ?? validation ?? (status === "taken" ? "This username is already taken." : undefined);
  const message = problem ?? (status === "available" ? "Username available."
    : status === "unavailable" ? "Could not check availability. You can still submit."
    : username && !disabled ? "Checking username…"
    : "Use 3–30 letters, numbers or underscores.");

  return (
    <div className="field">
      <label className="label" htmlFor={id}>Username{optional ? " (optional)" : ""}</label>
      <input
        id={id}
        className={"input" + (problem ? " bad" : "")}
        value={value}
        disabled={disabled}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={!!problem}
        aria-describedby={id + "-hint"}
        onChange={(event) => onChange(event.target.value)}
      />
      <span id={id + "-hint"} role="status" className={problem ? "small c-fail" : status === "available" ? "small c-ok" : "hint"}>
        {message}
      </span>
    </div>
  );
}
