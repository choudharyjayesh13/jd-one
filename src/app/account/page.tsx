import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { AccountPage } from "@/modules/settings/AccountPage";

export const metadata: Metadata = { title: "My account" };

export default function Page() {
  return (
    <AuthGate>
      <AccountPage />
    </AuthGate>
  );
}
