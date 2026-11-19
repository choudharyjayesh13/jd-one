import { DoorOpen, Car, LogOut } from "lucide-react";
import { defineEntity, type EntityAction } from "@/core/schema/types";
import { nowLocalInput } from "@/core/format";

export const VISIT_PURPOSES = ["Guest", "Visitor for guest", "Vendor / delivery", "Contractor / repair", "Staff family", "Interview", "Other"] as const;
export const ID_TYPES = ["Aadhaar", "Driving licence", "Voter ID", "Passport", "Company ID", "None"] as const;
export const VEHICLE_TYPES = ["Car", "Bike / scooter", "Taxi", "Tempo / truck", "Bus / traveller", "Other"] as const;
export const VEHICLE_PURPOSES = ["Guest", "Staff", "Delivery", "Visitor", "Taxi drop / pick-up", "Other"] as const;

const markExit = (entity: string): EntityAction => ({
  id: "exit",
  label: "Mark exit",
  icon: LogOut,
  variant: "primary",
  visible: (r) => !r.time_out,
  async run({ record, store, toast, refresh }) {
    await store.update(entity, record.id, { time_out: new Date().toISOString() });
    toast("Exit time saved");
    await refresh();
  },
});

/** People coming in at the gate. */
export const gateEntries = defineEntity({
  name: "gate-entries",
  label: "Gate register",
  labelSingular: "Gate entry",
  icon: DoorOpen,
  table: "gate_entries",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "visitor_name",
  searchFields: ["visitor_name", "phone", "to_meet", "vehicle_no"],
  defaultSort: { field: "time_in", dir: "desc" },
  fields: [
    { name: "time_in", label: "Time in", type: "datetime", required: true, default: nowLocalInput },
    { name: "visitor_name", label: "Name", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "people", label: "People", type: "number", min: 1, default: 1 },
    { name: "purpose", label: "Purpose", type: "select", options: VISIT_PURPOSES, required: true, default: "Visitor for guest" },
    { name: "to_meet", label: "To meet", type: "text", placeholder: "Guest / staff name, room" },
    { name: "vehicle_no", label: "Vehicle no.", type: "text", placeholder: "RJ27 AB 1234" },
    { name: "id_type", label: "ID seen", type: "select", options: ID_TYPES, default: "Aadhaar" },
    { name: "id_last4", label: "ID last 4 digits", type: "text", placeholder: "1234" },
    { name: "time_out", label: "Time out", type: "datetime" },
    { name: "guard", label: "Guard", type: "relation", entity: "staff", defaultToMe: true },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["time_in", "visitor_name", "purpose", "to_meet", "people", "time_out"],
  actions: [markExit("gate-entries")],
});

/** Vehicles coming in and going out. */
export const vehicleEntries = defineEntity({
  name: "vehicle-entries",
  label: "Vehicle entry",
  labelSingular: "Vehicle entry",
  icon: Car,
  table: "vehicle_entries",
  teams: ["operations"],
  unitField: "business_unit_id",
  titleField: "vehicle_no",
  searchFields: ["vehicle_no", "driver_name", "phone"],
  defaultSort: { field: "time_in", dir: "desc" },
  fields: [
    { name: "time_in", label: "Time in", type: "datetime", required: true, default: nowLocalInput },
    { name: "vehicle_no", label: "Vehicle no.", type: "text", required: true, placeholder: "RJ27 AB 1234" },
    { name: "vehicle_type", label: "Type", type: "select", options: VEHICLE_TYPES, required: true, default: "Car" },
    { name: "purpose", label: "Purpose", type: "select", options: VEHICLE_PURPOSES, required: true, default: "Guest" },
    { name: "driver_name", label: "Driver / guest name", type: "text" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "booking_id", label: "Guest's booking", type: "relation", entity: "bookings" },
    { name: "parking_spot", label: "Parked at", type: "text" },
    { name: "time_out", label: "Time out", type: "datetime" },
    { name: "guard", label: "Guard", type: "relation", entity: "staff", defaultToMe: true },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["time_in", "vehicle_no", "vehicle_type", "purpose", "driver_name", "time_out"],
  actions: [markExit("vehicle-entries")],
});
