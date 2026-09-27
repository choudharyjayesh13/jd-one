import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { AttendanceGrid } from "@/modules/attendance/AttendanceGrid";

export const metadata: Metadata = { title: "Attendance grid" };

export default function Page() {
  return (
    <AuthGate>
      <AttendanceGrid />
    </AuthGate>
  );
}
