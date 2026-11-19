import { PartyPopper, Send } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { formatDate, formatMoney } from "@/core/format";

export const EVENT_TYPES = ["Wedding", "Engagement / ring ceremony", "Birthday", "Anniversary", "Corporate / offsite", "Pool / DJ party", "Kitty party", "Other"] as const;
export const EVENT_VENUES = ["Lawn", "Poolside", "Restaurant", "Banquet hall", "Lakeside deck", "Whole property", "Other"] as const;
export const EVENT_STATUSES = ["Enquiry", "Tentative", "Confirmed", "Done", "Cancelled"] as const;

/** Banquets & events: what, when, how many, menu for the kitchen, money. */
export const events = defineEntity({
  name: "events",
  label: "Banquets & events",
  labelSingular: "Event",
  icon: PartyPopper,
  table: "events",
  teams: ["marketing", "property"],
  unitField: "business_unit_id",
  titleField: "client_name",
  searchFields: ["client_name", "phone", "event_type", "notes"],
  defaultSort: { field: "event_date", dir: "asc" },
  fields: [
    { name: "event_date", label: "Event date", type: "date", required: true },
    { name: "start_time", label: "Start time", type: "text", placeholder: "19:00" },
    { name: "event_type", label: "Event", type: "select", options: EVENT_TYPES, required: true, default: "Birthday" },
    { name: "client_name", label: "Client", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone", required: true },
    { name: "guests", label: "Guests (pax)", type: "number", min: 1, required: true },
    { name: "venue", label: "Venue", type: "select", options: EVENT_VENUES, default: "Lawn" },
    { name: "menu", label: "Menu / function sheet for kitchen", type: "textarea", wide: true, placeholder: "Welcome drink, 4 starters, main course…" },
    { name: "setup", label: "Decoration, DJ, sound, stage", type: "textarea", wide: true },
    { name: "rate_per_plate", label: "Rate per plate (₹)", type: "money", min: 0 },
    { name: "other_charges", label: "Other charges (₹)", type: "money", min: 0, help: "Decoration, DJ, venue…" },
    { name: "total", label: "Total (₹)", type: "money", min: 0, help: "Leave blank for plates × rate + other charges" },
    { name: "advance", label: "Advance received (₹)", type: "money", min: 0 },
    { name: "balance", label: "Balance", type: "money", readOnly: true },
    { name: "status", label: "Status", type: "select", options: EVENT_STATUSES, required: true, default: "Enquiry" },
    { name: "lead_id", label: "Lead", type: "relation", entity: "leads" },
    { name: "owner_id", label: "Handled by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
  ],
  listColumns: ["event_date", "event_type", "client_name", "guests", "venue", "total", "status"],
  hooks: {
    beforeSave(values) {
      const out = { ...values };
      if (out.total === null || out.total === undefined) out.total = (Number(out.guests) || 0) * (Number(out.rate_per_plate) || 0) + (Number(out.other_charges) || 0);
      out.balance = (Number(out.total) || 0) - (Number(out.advance) || 0);
      return out;
    },
  },
  actions: [
    {
      id: "share",
      label: "Share function sheet",
      icon: Send,
      variant: "primary",
      run: ({ record }) => {
        const text = [
          `Function sheet — ${String(record.event_type ?? "")}`,
          `${formatDate(record.event_date)}${record.start_time ? ` · ${String(record.start_time)}` : ""} · ${String(record.venue ?? "")}`,
          `Client: ${String(record.client_name ?? "")} · ${String(record.guests ?? "")} pax`,
          record.menu ? `Menu:\n${String(record.menu)}` : "",
          record.setup ? `Setup:\n${String(record.setup)}` : "",
          `Total ${formatMoney(record.total)} · advance ${formatMoney(record.advance)} · balance ${formatMoney(record.balance)}`,
        ]
          .filter(Boolean)
          .join("\n");
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      },
    },
  ],
});
