import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { ReportIssue } from "@/modules/report-issue/ReportIssue";

export const metadata: Metadata = { title: "Report an issue" };

export default function Page() {
  return (
    <AuthGate>
      <ReportIssue />
    </AuthGate>
  );
}
