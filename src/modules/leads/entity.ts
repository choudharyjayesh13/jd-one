import { Target, BedDouble, MessageSquarePlus, PhoneOff, PhoneCall, Trophy } from "lucide-react";
import { addDays, todayISO } from "@/core/format";
import { defineEntity } from "@/core/schema/types";
import { normalizePhone } from "@/core/phone";
import { newHref } from "@/core/routes";
import { customerLiveHint, findCustomerByPhone } from "@/modules/customers/match";
import { LEAD_QUALIFICATIONS, LEAD_SOURCES, LEAD_STAGES } from "./options";

export const leads = defineEntity({
  name: "leads",
  label: "Leads & CRM",
  labelSingular: "Lead",
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
    { name: "follow_up_status", label: "Follow-up", type: "text", virtual: true, computed: (v) => followUpStatus(v) },
    { name: "call_attempts", label: "Call attempts", type: "number", min: 0, default: 0 },
    { name: "last_contact", label: "Last contact", type: "date" },
    { name: "lost_reason", label: "Lost reason", type: "text" },
    { name: "notes", label: "Notes", type: "textarea" },
    { name: "external_source", label: "Imported from", type: "text", readOnly: true },
    { name: "crm_id", label: "CRM / sheet ref", type: "text", readOnly: true },
    { name: "won_at", label: "Converted on", type: "datetime", readOnly: true },
    { name: "external_id", label: "External id", type: "text", readOnly: true, hidden: true },
  ],
  listColumns: ["name", "stage", "follow_up_status", "next_follow_up", "assigned_to", "qualification", "call_attempts", "phone"],
  reverse: [
    { entity: "activities", field: "lead_id", label: "Activities" },
    { entity: "bookings", field: "lead_id", label: "Bookings" },
  ],
  hooks: {
    async beforeSave(values, ctx) {
      // Leads link to an EXISTING guest by phone; a new guest (JDG number, lifetime CRM record) is created
      // by the database only when the lead is converted (stage Won or a booking is made from it).
      const phone = normalizePhone(values.phone) || null;
      const existing = values.customer_id ? null : await findCustomerByPhone(ctx.store, phone);
      return { ...values, phone, customer_id: values.customer_id ?? existing?.id ?? null };
    },
  },
  actions: [
    {
      id: "no-answer",
      label: "Called – no answer",
      icon: PhoneOff,
      visible: (r) => r.stage !== "Won" && r.stage !== "Lost",
      async run({ record, store, toast, refresh }) {
        await store.update("leads", record.id, {
          call_attempts: Number(record.call_attempts ?? 0) + 1,
          last_contact: todayISO(),
          next_follow_up: addDays(todayISO(), 1),
          stage: record.stage === "New" ? "Contacted" : record.stage,
        });
        toast("Logged — follow-up set for tomorrow");
        await refresh();
      },
    },
    {
      id: "after-call",
      label: "Update after call",
      icon: PhoneCall,
      visible: (r) => r.stage !== "Won" && r.stage !== "Lost",
      form: { title: "What happened on the call?", fields: ["stage", "qualification", "next_follow_up", "visit_from", "visit_to", "guests", "budget", "lost_reason", "notes"], submitLabel: "Save" },
    },
    {
      id: "won",
      label: "Mark converted (Won)",
      icon: Trophy,
      visible: (r) => r.stage !== "Won",
      async run({ record, store, toast, refresh }) {
        await store.update("leads", record.id, { stage: "Won", last_contact: todayISO() });
        toast("Converted — saved as a lifetime guest (JDG number) in Customers");
        await refresh();
      },
    },
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

/** Overdue / Today / Upcoming / Not set, for open leads. */
export function followUpStatus(v: Record<string, unknown>): string {
  if (v.stage === "Won" || v.stage === "Lost") return "Closed";
  const d = String(v.next_follow_up ?? "").slice(0, 10);
  if (!d) return v.stage === "New" ? "Call now" : "Not set";
  const t = todayISO();
  return d < t ? "Overdue" : d === t ? "Today" : "Upcoming";
}
