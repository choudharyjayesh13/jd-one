import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { SalesPage } from "@/modules/pipeline/SalesPage";

export const metadata: Metadata = { title: "Sales pipeline" };

export default function Page() {
  return (
    <AuthGate>
      <SalesPage />
    </AuthGate>
  );
}
