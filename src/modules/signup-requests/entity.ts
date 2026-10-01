import { UserRoundPlus } from "lucide-react";
import { ALL_ROLES, defineEntity } from "@/core/schema/types";

export const SIGNUP_STATUSES = ["Pending", "Approved", "Rejected"] as const;
/** The three kinds of people on the network. */
export const SIGNUP_KINDS = ["owner", "staff", "customer"] as const;
export type SignupKind = (typeof SIGNUP_KINDS)[number];
/** Roles that may approve or reject a sign-up (mirrors the RLS policy in schema.sql). */
export const APPROVER_ROLES = ["owner", "manager", "hr"] as const;

/**
 * A staff member who created their own login (Login → Create account) and is
 * waiting for HR to approve them. Approval creates the `staff` row; until then
 * the app shows the "Pending approval" screen. Not in the sidebar — the
 * requests appear as a card on HR → Staff.
 */
export const signupRequests = defineEntity({
  name: "signup-requests",
  label: "Sign-up requests",
  labelSingular: "Sign-up request",
  icon: UserRoundPlus,
  table: "signup_requests",
  teams: ["hr"],
  hidden: true,
  titleField: "name",
  searchFields: ["name", "phone", "email", "designation"],
  defaultSort: { field: "requested_at", dir: "desc" },
  permissions: { read: ALL_ROLES, create: ALL_ROLES, update: [...APPROVER_ROLES], delete: [...APPROVER_ROLES] },
  fields: [
    { name: "kind", label: "Joining as", type: "select", options: SIGNUP_KINDS, default: "staff", required: true },
    { name: "name", label: "Name", type: "text", required: true },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "email", label: "Email", type: "email", required: true },
    { name: "designation", label: "Designation", type: "text" },
    { name: "business_name", label: "Business name", type: "text", help: "Owners: the business they want to run on JD One" },
    { name: "business_type", label: "Business type", type: "text" },
    { name: "city", label: "City", type: "text" },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units" },
    { name: "status", label: "Status", type: "select", options: SIGNUP_STATUSES, required: true, default: "Pending" },
    { name: "requested_at", label: "Requested", type: "datetime", readOnly: true },
    { name: "decided_by", label: "Decided by", type: "relation", entity: "staff", readOnly: true, defaultToMe: false },
    { name: "decided_at", label: "Decided", type: "datetime", readOnly: true },
    { name: "note", label: "Note", type: "textarea", help: "Shown to the person when rejected" },
    { name: "auth_user_id", label: "Login user id", type: "text", readOnly: true, hidden: true },
  ],
  listColumns: ["name", "status", "email", "phone", "designation", "business_unit_id", "requested_at"],
});
