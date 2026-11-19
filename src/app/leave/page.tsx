import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { LeavePage } from "@/modules/leave/LeavePage";

export const metadata: Metadata = { title: "Leave requests" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <LeavePage />
      </Suspense>
    </AuthGate>
  );
}
