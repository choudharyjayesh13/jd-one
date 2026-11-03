import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { OtaBookings } from "@/modules/accounts-extra/OtaBookings";

export const metadata: Metadata = { title: "OTA bookings" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <OtaBookings />
      </Suspense>
    </AuthGate>
  );
}
