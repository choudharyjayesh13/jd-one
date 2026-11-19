import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { NightAuditView } from "@/modules/night-audit/NightAuditView";

export const metadata: Metadata = { title: "Night audit report" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <NightAuditView />
      </Suspense>
    </AuthGate>
  );
}
