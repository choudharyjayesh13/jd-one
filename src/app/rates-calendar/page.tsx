import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { RatesCalendar } from "@/modules/rates/RatesCalendar";

export const metadata: Metadata = { title: "Rates calendar" };

export default function Page() {
  return (
    <AuthGate>
      <RatesCalendar />
    </AuthGate>
  );
}
