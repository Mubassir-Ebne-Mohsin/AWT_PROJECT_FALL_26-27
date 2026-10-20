import { toast } from "sonner";

export type ToastKind = "ok" | "info" | "warn" | "fail";

/** One entry point for toasts, using the prototype's four kinds. */
export function notify(message: string, kind: ToastKind = "ok") {
  const fn = { ok: toast.success, info: toast.info, warn: toast.warning, fail: toast.error }[kind];
  fn(message);
}
