import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { VoucherPrint } from "@/modules/vouchers/VoucherPrint";

export const metadata: Metadata = { title: "Voucher" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <VoucherPrint />
      </Suspense>
    </AuthGate>
  );
}
