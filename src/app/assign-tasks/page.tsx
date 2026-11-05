import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { AssignTasks } from "@/modules/task-board/AssignTasks";

export const metadata: Metadata = { title: "Assign tasks" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <AssignTasks />
      </Suspense>
    </AuthGate>
  );
}
