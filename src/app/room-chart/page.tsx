import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { RoomChart } from "@/modules/rooms/RoomChart";

export const metadata: Metadata = { title: "Room chart" };

export default function Page() {
  return (
    <AuthGate>
      <RoomChart />
    </AuthGate>
  );
}
