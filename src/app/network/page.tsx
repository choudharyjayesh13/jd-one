import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { Network } from "@/modules/business-units/Network";

export const metadata: Metadata = { title: "JD One network" };

export default function Page() {
  return (
    <AuthGate>
      <Network />
    </AuthGate>
  );
}
