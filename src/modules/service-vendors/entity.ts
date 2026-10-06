import { HardHat } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { TICKET_CATEGORIES } from "@/modules/tickets/entity";

/** Repair contacts — carpenters, AC technicians, electricians, plumbers… shown as options when staff report an issue. */
export const serviceVendors = defineEntity({
  name: "service-vendors",
  label: "Repair contacts",
  labelSingular: "Repair contact",
  icon: HardHat,
  table: "service_vendors",
  teams: ["operations"],
  titleField: "name",
  searchFields: ["name", "trade", "area", "phone"],
  defaultSort: { field: "trade", dir: "asc" },
  secondarySort: { field: "name", dir: "asc" },
  fields: [
    { name: "name", label: "Name", type: "text", required: true, placeholder: "Ramesh Carpenter" },
    { name: "trade", label: "Trade", type: "select", options: TICKET_CATEGORIES, required: true },
    { name: "phone", label: "Phone / WhatsApp", type: "phone" },
    { name: "area", label: "Area", type: "text", placeholder: "Lakadwas, Udaipur city…" },
    { name: "rating", label: "Our rating (1–5)", type: "number", min: 1, max: 5, step: 0.5 },
    { name: "visit_charge", label: "Visit / labour charge", type: "text", placeholder: "₹300 visit + parts" },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "active", label: "Active", type: "boolean", default: true },
  ],
  listColumns: ["name", "trade", "phone", "area", "rating", "visit_charge", "active"],
});
