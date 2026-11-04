import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { CheckInPage } from "@/modules/frontdesk/Pages";

export const metadata: Metadata = { title: "Check-in" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <CheckInPage />
      </Suspense>
    </AuthGate>
  );
}
