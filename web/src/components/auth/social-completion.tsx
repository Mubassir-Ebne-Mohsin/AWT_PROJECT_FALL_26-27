"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { socialCompletion, rememberProof } from "@/lib/api/social";
import { refreshSession } from "@/lib/api/client";
import { safeNext } from "@/lib/safe-next";
// Shared promise makes React Strict Mode's effect replay consume a single-use completion only once.
let completion: ReturnType<typeof socialCompletion> | null = null;
export function SocialCompletion() {
  const router = useRouter(),
    requested = useSearchParams().get("oauth") === "1",
    [error, setError] = useState("");
  useEffect(() => {
    if (!requested) return;
    let alive = true;
    completion ??= socialCompletion();
    const current = completion;
    void (async () => {
      try {
        const result = await current;
        if (result.kind === "login") {
          const refreshed = await refreshSession();
          if (!refreshed.ok)
            throw Error("Sign-in could not be restored. Please try again.");
        } else if (
          result.kind === "proof" &&
          result.proof &&
          result.owner &&
          result.action
        ) {
          rememberProof({
            proof: result.proof,
            owner: result.owner,
            action: result.action,
          });
        }
        if (alive) router.replace(safeNext(result.next));
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error ? e.message : "Sign-in could not be completed.",
          );
      } finally {
        if (completion === current) completion = null;
      }
    })();
    return () => {
      alive = false;
    };
  }, [router, requested]);
  return (
    <div className="page narrow stack lg">
      <h1 className="h1">Completing sign-in</h1>
      {error || !requested ? (
        <>
          <p role="alert">
            {error ||
              "Start sign-in with Google or GitHub from the Log in page."}
          </p>
          <Link href="/login">Return to Log in</Link>
        </>
      ) : (
        <p role="status">Restoring your StressForge session…</p>
      )}
    </div>
  );
}
