import { Handshake } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

/** Customer pipeline stages — from first enquiry to the stay/event being done. */
export const DEAL_STAGES = ["Enquiry", "Quote sent", "Negotiation", "Advance received", "Confirmed", "Completed", "Lost"] as const;
export const DEAL_OPEN_STAGES = DEAL_STAGES.filter((s) => s !== "Completed" && s !== "Lost");
export const DEAL_KINDS = ["Stay", "Villa buyout", "Event / party", "Wedding", "Corporate", "Food & catering", "Salon / beauty", "Property / real estate", "Other"] as const;

/** One deal per thing a customer is buying from us — repeat customers can have many deals over time. */
export const deals = defineEntity({
  name: "deals",
  label: "Customer deals",
  labelSingular: "Deal",
  icon: Handshake,
  table: "deals",
  teams: ["marketing", "property"],
  unitField: "business_unit_id",
  titleField: "title",
  searchFields: ["title", "contact_name", "phone", "notes"],
  defaultSort: { field: "updated_at", dir: "desc" },
  fields: [
    { name: "title", label: "Deal", type: "text", required: true, placeholder: "Sharma family · 2 cottages · 24–26 Oct" },
    { name: "customer_id", label: "Customer", type: "relation", entity: "customers" },
    { name: "lead_id", label: "From lead", type: "relation", entity: "leads" },
    { name: "contact_name", label: "Contact name", type: "text" },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "kind", label: "Type", type: "select", options: DEAL_KINDS, required: true, default: "Stay" },
    { name: "stage", label: "Stage", type: "select", options: DEAL_STAGES, required: true, default: "Enquiry" },
    { name: "value", label: "Deal value (₹)", type: "money", min: 0, default: 0 },
    { name: "advance", label: "Advance received (₹)", type: "money", min: 0, default: 0 },
    { name: "expected_date", label: "Stay / event date", type: "date" },
    { name: "next_follow_up", label: "Next follow-up", type: "date", default: todayISO },
    { name: "assigned_to", label: "Owner", type: "relation", entity: "staff", defaultToMe: true },
    { name: "lost_reason", label: "Lost reason", type: "text" },
    { name: "closed_at", label: "Closed on", type: "date" },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  listColumns: ["title", "stage", "kind", "value", "advance", "expected_date", "next_follow_up", "assigned_to"],
  hooks: {
    beforeSave: (v) => {
      const closed = v.stage === "Completed" || v.stage === "Lost";
      return { ...v, closed_at: closed ? (v.closed_at || todayISO()) : null };
    },
  },
});
