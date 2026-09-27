import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { SettingsPage } from "@/modules/settings/SettingsPage";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <AuthGate>
      <SettingsPage />
    </AuthGate>
  );
}
