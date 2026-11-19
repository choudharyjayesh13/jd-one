import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { Reports } from "@/modules/reports/Reports";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <AuthGate>
      <Reports />
    </AuthGate>
  );
}
