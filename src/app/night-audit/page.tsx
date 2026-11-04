import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { NightAudit } from "@/modules/night-audit/NightAudit";

export const metadata: Metadata = { title: "Night audit" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <NightAudit />
      </Suspense>
    </AuthGate>
  );
}
