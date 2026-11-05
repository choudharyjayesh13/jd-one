import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { PrepList } from "@/modules/kitchen/PrepList";

export const metadata: Metadata = { title: "Prep list" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <PrepList />
      </Suspense>
    </AuthGate>
  );
}
