import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { MealCounts } from "@/modules/kitchen/MealCounts";

export const metadata: Metadata = { title: "Meal counts" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <MealCounts />
      </Suspense>
    </AuthGate>
  );
}
