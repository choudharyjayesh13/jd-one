import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { ReportDuty } from "@/modules/night-audit/ReportDuty";

export const metadata: Metadata = { title: "Report duty" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <ReportDuty />
      </Suspense>
    </AuthGate>
  );
}
