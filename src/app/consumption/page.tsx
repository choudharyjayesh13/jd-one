import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { Consumption } from "@/modules/stores/Consumption";

export const metadata: Metadata = { title: "Consumption report" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <Consumption />
      </Suspense>
    </AuthGate>
  );
}
