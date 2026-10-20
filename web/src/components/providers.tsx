"use client";

import { ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { AuthProvider } from "@/components/auth/auth-provider";
import { UiProvider, useUi } from "@/components/shell/ui-provider";
import { ApiError } from "@/lib/api/errors";
import { apiEvents } from "@/lib/api/events";

/** Turns API-level failures (see lib/api/client.ts) into system-state screens. */
function ApiEventBridge() {
  const { openSystem } = useUi();
  useEffect(() => {
    const offs = [
      apiEvents.on("unreachable", () => openSystem("waking")),
      apiEvents.on("session-expired", () => openSystem("session")),
      apiEvents.on("server-error", () => openSystem("500")),
      apiEvents.on("rate-limited", () => openSystem("ratelimited")),
      apiEvents.on("forbidden", () => openSystem("403")),
    ];
    return () => offs.forEach((off) => off());
  }, [openSystem]);
  return null;
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="bottom-right"
      closeButton
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      toastOptions={{ classNames: { toast: "sf-toast" } }}
    />
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // The client already refreshes once on 401; retrying auth/validation errors is pointless.
            retry: (count, error) => !(error instanceof ApiError) && count < 2,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="sf-theme">
      <QueryClientProvider client={queryClient}>
        <UiProvider>
          <AuthProvider>
            <ApiEventBridge />
            {children}
            <ThemedToaster />
          </AuthProvider>
        </UiProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
