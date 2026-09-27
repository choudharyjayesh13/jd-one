/** A lead as understood by the importer, independent of the source layout. */
export interface ImportedLead {
  /** Stable id from the source so re-imports update instead of duplicating. */
  external_id: string | null;
  external_source: string;
  /** ISO timestamp; becomes created_at on new leads. */
  created_at: string | null;
  customer: { name: string; phone: string; email?: string | null; city?: string | null; company?: string | null };
  lead: {
    name: string;
    phone: string;
    email?: string | null;
    source: string;
    campaign?: string | null;
    requirement?: string | null;
    visit_from?: string | null;
    visit_to?: string | null;
    guests?: number | null;
    budget?: number | null;
    qualification?: string | null;
    stage?: string | null;
    next_follow_up?: string | null;
    last_contact?: string | null;
    lost_reason?: string | null;
    notes?: string | null;
  };
  /** Free-text names resolved against staff / business units at import time. */
  assigned_to_name?: string | null;
  business_unit_name?: string | null;
}

export interface ImportSummary {
  rows: number;
  customersCreated: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  messages: string[];
}

/** The generic mapping the in-app importer edits: target field → source column. */
export type TargetField =
  | "external_id"
  | "created_at"
  | "name"
  | "phone"
  | "email"
  | "city"
  | "company"
  | "business_unit"
  | "source"
  | "campaign"
  | "requirement"
  | "visit_from"
  | "visit_to"
  | "guests"
  | "budget"
  | "qualification"
  | "stage"
  | "assigned_to"
  | "next_follow_up"
  | "last_contact"
  | "lost_reason"
  | "notes";

export const TARGET_FIELDS: { id: TargetField; label: string }[] = [
  { id: "external_id", label: "Lead id (dedupe key)" },
  { id: "created_at", label: "Date added" },
  { id: "name", label: "Name" },
  { id: "phone", label: "Phone" },
  { id: "email", label: "Email" },
  { id: "city", label: "City" },
  { id: "company", label: "Company" },
  { id: "business_unit", label: "Business unit" },
  { id: "source", label: "Source" },
  { id: "campaign", label: "Campaign / ad" },
  { id: "requirement", label: "Requirement" },
  { id: "visit_from", label: "Visit from" },
  { id: "visit_to", label: "Visit to" },
  { id: "guests", label: "Guests" },
  { id: "budget", label: "Budget / deal value" },
  { id: "qualification", label: "Qualification" },
  { id: "stage", label: "Stage" },
  { id: "assigned_to", label: "Assigned to (staff name)" },
  { id: "next_follow_up", label: "Next follow-up" },
  { id: "last_contact", label: "Last contact" },
  { id: "lost_reason", label: "Lost reason" },
  { id: "notes", label: "Notes" },
];

export type ColumnMapping = Partial<Record<TargetField, string>>;
