import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { CheckIn } from "@/modules/attendance/CheckIn";

export const metadata: Metadata = { title: "Mark attendance" };

export default function Page() {
  return (
    <AuthGate>
      <CheckIn />
    </AuthGate>
  );
}
