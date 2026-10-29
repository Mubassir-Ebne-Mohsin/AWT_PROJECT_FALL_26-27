import type { Metadata } from "next";
import { SharedView } from "@/components/share/shared-view";

// A shared link is a bearer secret: never indexed, never leaked to another site through the Referer header.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedView token={token} />;
}
