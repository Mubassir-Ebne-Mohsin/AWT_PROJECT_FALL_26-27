"use client";

import { useEffect } from "react";
import { SystemScreen } from "@/components/system/system-screen";

// Renders inside the app shell when a page throws while rendering.
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = (error as { digest?: string } | null)?.digest;
  return <SystemScreen kind="500" reference={digest} onRetry={retry} />;
}
