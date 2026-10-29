import { Suspense } from "react";
import { DesignsList } from "@/components/library/designs-list";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DesignsList />
    </Suspense>
  );
}
