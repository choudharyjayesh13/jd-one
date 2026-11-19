import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthGate } from "@/core/ui/AuthGate";
import { RoomStatusBoard } from "@/modules/housekeeping/RoomStatusBoard";

export const metadata: Metadata = { title: "Room status board" };

export default function Page() {
  return (
    <AuthGate>
      <Suspense>
        <RoomStatusBoard />
      </Suspense>
    </AuthGate>
  );
}
