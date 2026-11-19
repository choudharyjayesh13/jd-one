import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { BookingChart } from "@/modules/rooms/BookingChart";

export const metadata: Metadata = { title: "Booking chart" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <BookingChart />
      </Suspense>
    </AuthGate>
  );
}
