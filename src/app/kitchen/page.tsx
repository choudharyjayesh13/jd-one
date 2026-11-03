import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { KitchenDisplay } from "@/modules/kitchen/KitchenDisplay";

export const metadata: Metadata = { title: "Kitchen display" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <KitchenDisplay />
      </Suspense>
    </AuthGate>
  );
}
