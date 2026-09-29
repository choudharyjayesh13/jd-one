import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { MyDay } from "@/modules/my-day/MyDay";

export const metadata: Metadata = { title: "My Day" };

export default function Page() {
  return (
    <AuthGate>
      <MyDay />
    </AuthGate>
  );
}
