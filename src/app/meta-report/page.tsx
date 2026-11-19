import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { MetaReport } from "@/modules/meta-sheet/MetaReport";

export const metadata: Metadata = { title: "Meta campaigns" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <MetaReport />
      </Suspense>
    </AuthGate>
  );
}
