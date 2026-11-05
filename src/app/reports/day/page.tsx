import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { DeptReports } from "@/modules/night-audit/DeptReports";

export const metadata: Metadata = { title: "Department reports" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <DeptReports />
      </Suspense>
    </AuthGate>
  );
}
