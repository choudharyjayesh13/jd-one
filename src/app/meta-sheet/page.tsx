import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { MetaSheetLink } from "@/modules/meta-sheet/MetaSheetLink";

export const metadata: Metadata = { title: "Meta sheet link" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <MetaSheetLink />
      </Suspense>
    </AuthGate>
  );
}
