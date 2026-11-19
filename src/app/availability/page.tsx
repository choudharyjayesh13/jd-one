import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { AvailabilityCalendar } from "@/modules/rooms/AvailabilityCalendar";

export const metadata: Metadata = { title: "Availability calendar" };

export default function Page() {
  return (
    <AuthGate>
      <AvailabilityCalendar />
    </AuthGate>
  );
}
