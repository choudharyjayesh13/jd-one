import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { DirectorChanges } from "@/modules/change-log/DirectorChanges";

export const metadata: Metadata = { title: "Director changes" };

export default function Page() {
  return (
    <AuthGate>
      <DirectorChanges />
    </AuthGate>
  );
}
