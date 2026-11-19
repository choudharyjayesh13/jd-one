import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { VendorDues } from "@/modules/accounts-extra/VendorDues";

export const metadata: Metadata = { title: "Vendor dues" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <VendorDues />
      </Suspense>
    </AuthGate>
  );
}
