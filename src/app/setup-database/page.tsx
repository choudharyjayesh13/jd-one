import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { DbSetupPage } from "@/core/ui/DbSetup";

export const metadata: Metadata = { title: "Database update" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <DbSetupPage />
      </Suspense>
    </AuthGate>
  );
}
