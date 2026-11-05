import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { MyDocuments } from "@/modules/staff-docs/MyDocuments";

export const metadata: Metadata = { title: "My documents" };

export default function Page() {
  return (
    <AuthGate>
      <MyDocuments />
    </AuthGate>
  );
}
