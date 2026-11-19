import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { EditApprovals } from "@/modules/edit-requests/EditApprovals";

export const metadata: Metadata = { title: "Edit approvals" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <EditApprovals />
      </Suspense>
    </AuthGate>
  );
}
