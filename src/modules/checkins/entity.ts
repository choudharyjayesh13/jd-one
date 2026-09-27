import { DoorOpen } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { nowLocalInput } from "@/core/format";

export const checkins = defineEntity({
  name: "checkins",
  label: "Check-ins",
  labelSingular: "Check-in",
  icon: DoorOpen,
  table: "checkins",
  teams: ["operations"],
  titleField: "room_numbers",
  searchFields: ["room_numbers", "vehicle"],
  defaultSort: { field: "actual_in", dir: "desc" },
  fields: [
    { name: "booking_id", label: "Booking", type: "relation", entity: "bookings", required: true },
    { name: "actual_in", label: "Actual check-in", type: "datetime", default: nowLocalInput },
    { name: "actual_out", label: "Actual check-out", type: "datetime" },
    { name: "id_proof_type", label: "ID proof", type: "select", options: ["Aadhaar", "PAN", "Passport", "Driving licence", "Voter ID", "Other"] },
    { name: "id_number", label: "ID number (last 4)", type: "text", help: "Only the last 4 digits are stored" },
    { name: "vehicle", label: "Vehicle", type: "text" },
    { name: "room_numbers", label: "Room numbers", type: "text" },
    { name: "handled_by", label: "Handled by", type: "relation", entity: "staff" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["booking_id", "actual_in", "actual_out", "room_numbers", "handled_by"],
  hooks: {
    beforeSave: (values) => ({ ...values, id_number: values.id_number ? String(values.id_number).replace(/\s/g, "").slice(-4) : null }),
  },
});
