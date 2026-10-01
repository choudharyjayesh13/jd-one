import type { Metadata } from "next";
import { AuthGate } from "@/core/ui/AuthGate";
import { HotelDetails } from "@/modules/business-units/HotelDetails";

export const metadata: Metadata = { title: "Hotel details" };

export default function Page() {
  return (
    <AuthGate>
      <HotelDetails />
    </AuthGate>
  );
}
