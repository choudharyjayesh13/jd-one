import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { TodayRates } from "@/modules/rates/TodayRates";

export const metadata: Metadata = { title: "Today's rates" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <TodayRates />
      </Suspense>
    </AuthGate>
  );
}
