import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { Pipeline } from "@/modules/pipeline/Pipeline";

export const metadata: Metadata = { title: "Sales pipeline" };

export default function Page() {
  return (
    <AuthGate>
      <Pipeline />
    </AuthGate>
  );
}
