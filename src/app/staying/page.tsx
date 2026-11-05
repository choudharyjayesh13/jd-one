import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { StayingPage } from "@/modules/frontdesk/Pages";

export const metadata: Metadata = { title: "Staying" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <StayingPage />
      </Suspense>
    </AuthGate>
  );
}
