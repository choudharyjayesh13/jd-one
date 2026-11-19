import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { CheckedOutPage } from "@/modules/frontdesk/Pages";

export const metadata: Metadata = { title: "Checked-out" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <CheckedOutPage />
      </Suspense>
    </AuthGate>
  );
}
