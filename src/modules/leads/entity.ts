import { Target, BedDouble, MessageSquarePlus } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { normalizePhone } from "@/core/phone";
import { newHref } from "@/core/routes";
import { customerLiveHint, matchOrCreateCustomer } from "@/modules/customers/match";
import { LEAD_QUALIFICATIONS, LEAD_SOURCES, LEAD_STAGES } from "./options";

export const leads = defineEntity({
  name: "leads",
  label: "Inquiries & leads",
  labelSingular: "Inquiry",
  icon: Target,
  table: "leads",
  teams: ["marketing"],
  unitField: "business_unit_id",
  titleField: "name",
  searchFields: ["name", "phone", "email", "campaign", "requirement"],
  defaultSort: { field: "created_at", dir: "desc" },
  unique: [["external_id"]],
  liveHint: { watch: ["phone"], compute: customerLiveHint },
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone", required: true },
    { name: "email", label: "Email", type: "email" },
    { name: "customer_id", label: "Customer", type: "relation", entity: "customers", help: "Matched automatically by phone" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "source", label: "Source", type: "select", options: LEAD_SOURCES, required: true },
    { name: "campaign", label: "Campaign / ad", type: "text" },
    { name: "requirement", label: "Requirement", type: "textarea", placeholder: "What are they looking for?" },
    { name: "visit_from", label: "Stay / visit from", type: "date" },
    { name: "visit_to", label: "Stay / visit to", type: "date" },
    { name: "guests", label: "Guests", type: "number", min: 0 },
    { name: "budget", label: "Budget / deal value", type: "money", min: 0 },
    { name: "qualification", label: "Qualification", type: "select", options: LEAD_QUALIFICATIONS },
    { name: "stage", label: "Stage", type: "select", options: LEAD_STAGES, required: true, default: "New" },
    { name: "assigned_to", label: "Assigned to", type: "relation", entity: "staff" },
    { name: "next_follow_up", label: "Next follow-up", type: "date" },
    { name: "last_contact", label: "Last contact", type: "date" },
    { name: "lost_reason", label: "Lost reason", type: "text" },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "external_source", label: "Imported from", type: "text", readOnly: true },
    { name: "external_id", label: "External id", type: "text", readOnly: true, hidden: true },
  ],
  listColumns: ["name", "stage", "qualification", "source", "assigned_to", "next_follow_up", "phone"],
  reverse: [
    { entity: "activities", field: "lead_id", label: "Activities" },
    { entity: "bookings", field: "lead_id", label: "Bookings" },
  ],
  hooks: {
    async beforeSave(values, ctx) {
      const phone = normalizePhone(values.phone) || null;
      const customer_id = await matchOrCreateCustomer(ctx.store, { ...values, phone }, "name", { source: values.source as string, staffId: ctx.staffId });
      return { ...values, phone, customer_id };
    },
  },
  actions: [
    {
      id: "convert",
      label: "Convert to booking",
      icon: BedDouble,
      variant: "primary",
      visible: (r) => r.stage !== "Won" && r.stage !== "Lost",
      run: ({ record, navigate }) =>
        navigate(
          newHref("bookings", {
            lead_id: record.id,
            customer_id: record.customer_id,
            guest_name: record.name,
            phone: record.phone,
            business_unit_id: record.business_unit_id,
            check_in: record.visit_from,
            check_out: record.visit_to,
            adults: record.guests,
            special_requests: record.requirement,
          }),
        ),
    },
    {
      id: "log-activity",
      label: "Log activity",
      icon: MessageSquarePlus,
      run: ({ record, navigate }) => navigate(newHref("activities", { lead_id: record.id, customer_id: record.customer_id })),
    },
  ],
});
