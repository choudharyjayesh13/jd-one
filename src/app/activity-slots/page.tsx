import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { ActivitySlots } from "@/modules/activity-bookings/ActivitySlots";

export const metadata: Metadata = { title: "Slots & capacity" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <ActivitySlots />
      </Suspense>
    </AuthGate>
  );
}
