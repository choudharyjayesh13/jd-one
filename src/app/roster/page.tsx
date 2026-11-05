import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { Roster } from "@/modules/home/Roster";

export const metadata: Metadata = { title: "Shift roster" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <Roster />
      </Suspense>
    </AuthGate>
  );
}
