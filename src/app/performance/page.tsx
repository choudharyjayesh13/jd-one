import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { Performance } from "@/modules/performance/Performance";

export const metadata: Metadata = { title: "Sales & occupancy" };

export default function Page() {
  return (
    <AuthGate>
      <Performance />
    </AuthGate>
  );
}
