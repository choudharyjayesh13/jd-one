import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { ScanToPay } from "@/modules/pay/ScanToPay";

export const metadata: Metadata = { title: "Scan to pay" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <ScanToPay />
      </Suspense>
    </AuthGate>
  );
}
