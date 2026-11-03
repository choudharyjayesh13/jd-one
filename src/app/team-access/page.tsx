import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { TeamAccess } from "@/modules/team-access/TeamAccess";

export const metadata: Metadata = { title: "Team access" };

export default function Page() {
  return (
    <AuthGate>
      <TeamAccess />
    </AuthGate>
  );
}
