import { Wrench, Play, CheckCircle2, ShieldCheck } from "lucide-react";
import { defineEntity, type FieldValues, type Row } from "@/core/schema/types";

export const TICKET_CATEGORIES = ["Carpenter", "AC / cooling", "Electrical", "Plumbing", "Painter", "Pest control", "Housekeeping", "Kitchen equipment", "IT / WiFi", "Pool", "Garden", "Safety", "Other"] as const;
export const TICKET_PRIORITIES = ["Urgent", "High", "Medium", "Low"] as const;
export const TICKET_STATUSES = ["Open", "In progress", "Waiting parts", "Done", "Verified"] as const;
export const TICKET_CLOSED: readonly string[] = ["Done", "Verified"];
export const isOpenTicket = (t: Row) => !TICKET_CLOSED.includes(String(t.status));

/** Lower = more urgent; stored so lists can sort by priority in both stores. */
const priorityRank = (p: unknown) => Math.max(0, TICKET_PRIORITIES.indexOf(p as (typeof TICKET_PRIORITIES)[number]));

/**
 * Maintenance tickets with photos/videos. Creating a ticket for someone also
 * creates a task in their My Day; closing the ticket closes that task.
 */
export const tickets = defineEntity({
  name: "tickets",
  label: "Tickets",
  labelSingular: "Ticket",
  icon: Wrench,
  table: "tickets",
  teams: ["operations", "hr"],
  unitField: "business_unit_id",
  titleField: "title",
  searchFields: ["title", "location", "description", "category"],
  defaultSort: { field: "priority_rank", dir: "asc" },
  secondarySort: { field: "created_at", dir: "desc" },
  fields: [
    { name: "title", label: "Title", type: "text", required: true, placeholder: "AC not cooling in Cottage 3" },
    { name: "category", label: "Category", type: "select", options: TICKET_CATEGORIES, required: true, default: "Other" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "location", label: "Location", type: "text", placeholder: "Cottage Water, Kitchen, Pool deck…" },
    { name: "booking_id", label: "Related booking", type: "relation", entity: "bookings" },
    { name: "priority", label: "Priority", type: "select", options: TICKET_PRIORITIES, required: true, default: "Medium" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "media", label: "Photos / videos", type: "files" },
    { name: "reported_by", label: "Reported by", type: "relation", entity: "staff" },
    { name: "vendor_id", label: "Repair contact", type: "relation", entity: "service-vendors", help: "Outside carpenter / technician called for this job" },
    { name: "assigned_to", label: "Assigned to", type: "relation", entity: "staff", defaultToMe: false, help: "A task is created in their My Day" },
    { name: "status", label: "Status", type: "select", options: TICKET_STATUSES, required: true, default: "Open" },
    { name: "due", label: "Due", type: "date" },
    { name: "started_at", label: "Work started", type: "datetime", readOnly: true },
    { name: "resolved_at", label: "Resolved", type: "datetime", readOnly: true },
    { name: "resolution_notes", label: "Resolution notes", type: "textarea" },
    { name: "resolution_media", label: "After photos / videos", type: "files" },
    { name: "cost", label: "Cost", type: "money", min: 0 },
    { name: "priority_rank", label: "Priority rank", type: "number", readOnly: true, hidden: true },
  ],
  listColumns: ["title", "status", "priority", "category", "location", "assigned_to", "due", "business_unit_id"],
  reverse: [{ entity: "tasks", field: "ticket_id", label: "Tasks" }],
  hooks: {
    async beforeSave(values, _ctx, id) {
      const out: FieldValues = { ...values, priority_rank: priorityRank(values.priority) };
      const now = new Date().toISOString();
      const status = String(values.status ?? "Open");
      // First response = the first time the ticket leaves "Open".
      if (status !== "Open" && !values.started_at) out.started_at = now;
      if (TICKET_CLOSED.includes(status)) {
        if (!values.resolved_at) out.resolved_at = now;
      } else if (id) out.resolved_at = null;
      return out;
    },
    async afterCreate(record, ctx) {
      if (record.assigned_to) await createLinkedTask(record, ctx.store, ctx.staffId);
    },
    async afterUpdate(record, previous, ctx) {
      const linked = await ctx.store.list("tasks", { filter: { ticket_id: record.id } });
      // Re-assigned: make sure the new person has it on their My Day.
      if (record.assigned_to && record.assigned_to !== previous.assigned_to && !linked.some((t) => t.assigned_to === record.assigned_to)) {
        await createLinkedTask(record, ctx.store, ctx.staffId);
      }
      // Ticket closed → close its tasks; re-opened → re-open them.
      const closed = TICKET_CLOSED.includes(String(record.status));
      for (const t of linked) {
        if (closed && t.status !== "Done") await ctx.store.update("tasks", t.id, { status: "Done", completed_at: record.resolved_at ?? new Date().toISOString() });
        else if (!closed && t.status === "Done" && TICKET_CLOSED.includes(String(previous.status))) await ctx.store.update("tasks", t.id, { status: "Open", completed_at: null });
      }
    },
  },
  actions: [
    {
      id: "start",
      label: "Start work",
      icon: Play,
      variant: "primary",
      visible: (r) => r.status === "Open" || r.status === "Waiting parts",
      async run({ record, store, staffId, toast, refresh }) {
        await store.update("tickets", record.id, { status: "In progress", started_at: record.started_at ?? new Date().toISOString(), assigned_to: record.assigned_to ?? staffId });
        toast("Work started");
        await refresh();
      },
    },
    {
      id: "done",
      label: "Mark done",
      icon: CheckCircle2,
      variant: "primary",
      visible: (r) => isOpenTicket(r),
      form: { title: "Mark ticket done", fields: ["resolution_notes", "resolution_media", "cost"], patch: { status: "Done" }, submitLabel: "Mark done" },
    },
    {
      id: "verify",
      label: "Verify",
      icon: ShieldCheck,
      visible: (r) => r.status === "Done",
      async run({ record, store, toast, refresh }) {
        await store.update("tickets", record.id, { status: "Verified" });
        toast("Ticket verified");
        await refresh();
      },
    },
  ],
});

async function createLinkedTask(ticket: Row, store: { create: (entity: string, data: FieldValues) => Promise<Row> }, staffId: string | null) {
  await store.create("tasks", {
    title: `Ticket: ${ticket.title}`,
    business_unit_id: ticket.business_unit_id,
    type: "Maintenance",
    priority: ticket.priority === "Urgent" ? "High" : (ticket.priority ?? "Medium"),
    assigned_to: ticket.assigned_to,
    due: ticket.due ?? null,
    status: "Open",
    booking_id: ticket.booking_id ?? null,
    ticket_id: ticket.id,
    points: ticket.priority === "Urgent" || ticket.priority === "High" ? 2 : 1,
    notes: [ticket.location ? `Location: ${ticket.location}` : "", ticket.description ?? ""].filter(Boolean).join("\n") || null,
    created_by: staffId,
  });
}
