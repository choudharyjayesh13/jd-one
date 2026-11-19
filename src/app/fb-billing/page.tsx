import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { FbBilling } from "@/modules/fnb/FbBilling";

export const metadata: Metadata = { title: "Room charge & billing" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <FbBilling />
      </Suspense>
    </AuthGate>
  );
}
