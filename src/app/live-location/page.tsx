import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { LiveLocation } from "@/modules/location/LiveLocation";

export const metadata: Metadata = { title: "Duty location" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <LiveLocation />
      </Suspense>
    </AuthGate>
  );
}
