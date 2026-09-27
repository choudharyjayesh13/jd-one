import { MessageSquare } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { nowLocalInput, todayISO } from "@/core/format";

export const activities = defineEntity({
  name: "activities",
  label: "Activities",
  labelSingular: "Activity",
  icon: MessageSquare,
  table: "activities",
  teams: ["marketing"],
  titleField: "summary",
  searchFields: ["summary", "next_action"],
  defaultSort: { field: "at", dir: "desc" },
  fields: [
    { name: "lead_id", label: "Lead", type: "relation", entity: "leads" },
    { name: "customer_id", label: "Customer", type: "relation", entity: "customers" },
    { name: "type", label: "Type", type: "select", options: ["call", "whatsapp", "meeting", "site visit", "email"], required: true, default: "call" },
    { name: "at", label: "When", type: "datetime", required: true, default: nowLocalInput },
    { name: "summary", label: "Summary", type: "textarea", required: true },
    { name: "next_action", label: "Next action", type: "text" },
    { name: "next_action_date", label: "Next action date", type: "date" },
    { name: "done_by", label: "Done by", type: "relation", entity: "staff" },
  ],
  listColumns: ["summary", "type", "at", "lead_id", "customer_id", "next_action_date", "done_by"],
  hooks: {
    async beforeSave(values, ctx) {
      // Inherit the customer from the lead so the 360° timeline stays complete.
      if (!values.customer_id && values.lead_id) {
        const lead = await ctx.store.get("leads", String(values.lead_id));
        if (lead?.customer_id) values = { ...values, customer_id: lead.customer_id };
      }
      return values;
    },
    async afterCreate(record, ctx) {
      // Logging an activity is a contact: move the lead's follow-up forward.
      if (!record.lead_id) return;
      const patch: Record<string, unknown> = { last_contact: todayISO() };
      if (record.next_action_date) patch.next_follow_up = record.next_action_date;
      const lead = await ctx.store.get("leads", String(record.lead_id));
      if (lead?.stage === "New") patch.stage = "Contacted";
      await ctx.store.update("leads", String(record.lead_id), patch);
    },
  },
});
