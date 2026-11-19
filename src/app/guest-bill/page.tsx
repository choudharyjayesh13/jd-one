import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { GuestBill } from "@/modules/bookings/GuestBill";

export const metadata: Metadata = { title: "Guest bill" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <GuestBill />
      </Suspense>
    </AuthGate>
  );
}
