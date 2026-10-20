"use client";

import { useEffect } from "react";

// Replaces the root layout, so it cannot use the providers, fonts or the shell:
// self-contained markup that follows the OS colour scheme.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = (error as { digest?: string } | null)?.digest;
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "Canvas", color: "CanvasText", colorScheme: "light dark" }}>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "15vh 24px" }}>
          <p style={{ font: "600 12px monospace", letterSpacing: ".08em", opacity: 0.7 }}>HTTP 500</p>
          <h1 style={{ fontSize: 30, margin: "8px 0 12px" }}>Something broke on our side.</h1>
          <p style={{ lineHeight: 1.55 }}>The app hit an error it could not recover from. Your designs are safe and nothing was lost.</p>
          {digest && <p style={{ font: "13px monospace", opacity: 0.7 }}>Reference: {digest}</p>}
          <button
            onClick={() => retry()}
            style={{ marginTop: 16, height: 40, padding: "0 18px", borderRadius: 6, border: "1px solid currentColor", background: "transparent", color: "inherit", font: "600 14px system-ui", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
