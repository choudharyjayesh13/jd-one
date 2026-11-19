import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { Arrivals } from "@/modules/rooms/Movements";

export const metadata: Metadata = { title: "Arrivals" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <Arrivals />
      </Suspense>
    </AuthGate>
  );
}
