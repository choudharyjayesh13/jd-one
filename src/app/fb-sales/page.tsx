import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { FbSales } from "@/modules/fnb/FbSales";

export const metadata: Metadata = { title: "Daily F&B sales" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <FbSales />
      </Suspense>
    </AuthGate>
  );
}
