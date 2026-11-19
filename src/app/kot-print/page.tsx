import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { KotPrinter } from "@/modules/kot/KotPrinter";

export const metadata: Metadata = { title: "Kitchen printer" };

export default function Page() {
  return (
    <AuthGate>
      <KotPrinter />
    </AuthGate>
  );
}
