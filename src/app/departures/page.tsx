import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { Departures } from "@/modules/rooms/Movements";

export const metadata: Metadata = { title: "Departures" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <Departures />
      </Suspense>
    </AuthGate>
  );
}
