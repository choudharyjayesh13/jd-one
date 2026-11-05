import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { HomeCardsSettings } from "@/modules/home/HomeCardsSettings";

export const metadata: Metadata = { title: "Home cards" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <HomeCardsSettings />
      </Suspense>
    </AuthGate>
  );
}
