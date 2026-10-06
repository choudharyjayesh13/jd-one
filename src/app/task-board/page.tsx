import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { TaskBoard } from "@/modules/task-board/TaskBoard";

export const metadata: Metadata = { title: "Task board" };

export default function Page() {
  return (
    <AuthGate>
      <TaskBoard />
    </AuthGate>
  );
}
