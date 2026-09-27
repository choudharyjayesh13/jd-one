import { UserPlus } from "lucide-react";
import { ADMIN_ROLES, defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";
import { viewHref } from "@/core/routes";

export const CANDIDATE_STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected", "On Hold"] as const;

/**
 * Hiring pipeline (HR). A candidate moves Applied → … → Hired; "Mark as hired"
 * creates the Staff record so attendance, salary and logins start immediately.
 */
export const candidates = defineEntity({
  name: "candidates",
  label: "Hiring",
  labelSingular: "Candidate",
  icon: UserPlus,
  table: "candidates",
  teams: ["hr"],
  titleField: "name",
  searchFields: ["name", "phone", "position", "notes"],
  defaultSort: { field: "created_at", dir: "desc" },
  unitField: "business_unit_id",
  permissions: { create: [...ADMIN_ROLES, "hr"], update: [...ADMIN_ROLES, "hr"], delete: ["owner"] },
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone", required: true },
    { name: "email", label: "Email", type: "email" },
    { name: "position", label: "Position applied", type: "text", required: true, placeholder: "Chef, Front office, Housekeeping…" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "source", label: "Source", type: "select", options: ["Referral", "Walk-in", "Naukri", "Indeed", "WhatsApp", "Agency", "Other"], default: "Referral" },
    { name: "stage", label: "Stage", type: "select", options: CANDIDATE_STAGES, required: true, default: "Applied" },
    { name: "applied_on", label: "Applied on", type: "date", default: todayISO },
    { name: "interview_on", label: "Interview", type: "datetime" },
    { name: "expected_salary", label: "Expected salary", type: "money", min: 0 },
    { name: "offered_salary", label: "Offered salary", type: "money", min: 0 },
    { name: "joining_date", label: "Joining date", type: "date" },
    { name: "experience_years", label: "Experience (years)", type: "number", min: 0, step: 0.5 },
    { name: "current_city", label: "City", type: "text" },
    { name: "interviewer", label: "Interviewer", type: "relation", entity: "staff" },
    { name: "staff_id", label: "Staff record", type: "relation", entity: "staff", readOnly: true, help: "Filled when hired" },
    { name: "documents", label: "ID / documents", type: "file" },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  listColumns: ["name", "position", "stage", "business_unit_id", "phone", "applied_on", "joining_date", "interviewer"],
  actions: [
    {
      id: "hire",
      label: "Mark as hired",
      icon: UserPlus,
      variant: "primary",
      visible: (r) => r.stage !== "Hired" && r.stage !== "Rejected",
      async run({ record, store, navigate, toast, confirm }) {
        if (!(await confirm(`Hire ${record.name} as ${record.position}? A staff record will be created.`))) return;
        const staff = await store.create("staff", {
          name: record.name,
          phone: record.phone,
          email: record.email ?? null,
          role: "staff",
          business_unit_id: record.business_unit_id,
          designation: record.position,
          active: true,
          joined_on: record.joining_date ?? todayISO(),
          salary: record.offered_salary ?? record.expected_salary ?? null,
          notes: `Hired via JD One hiring pipeline (candidate ${record.name}, ${record.source ?? "source unknown"})`,
        });
        await store.update("candidates", record.id, { stage: "Hired", staff_id: staff.id, joining_date: record.joining_date ?? todayISO() });
        toast(`${record.name} added to staff`, "success");
        navigate(viewHref("staff", staff.id));
      },
    },
  ],
});
