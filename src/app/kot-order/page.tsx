import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { KotOrder } from "@/modules/kot/KotOrder";

export const metadata: Metadata = { title: "New KOT order" };

export default function Page() {
  return (
    <AuthGate>
      <KotOrder />
    </AuthGate>
  );
}
