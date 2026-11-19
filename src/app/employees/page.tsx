import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { Employees } from "@/modules/staff/Employees";

export const metadata: Metadata = { title: "Employees" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <Employees />
      </Suspense>
    </AuthGate>
  );
}
