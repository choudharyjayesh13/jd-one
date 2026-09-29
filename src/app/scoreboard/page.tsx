import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { Scoreboard } from "@/modules/scoreboard/Scoreboard";

export const metadata: Metadata = { title: "Scoreboard" };

export default function Page() {
  return (
    <AuthGate>
      <Scoreboard />
    </AuthGate>
  );
}
