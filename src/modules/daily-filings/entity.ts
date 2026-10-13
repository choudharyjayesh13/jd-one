import { FolderUp } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const FILING_CATEGORIES = [
  "Bills & vouchers",
  "Cash book / register page",
  "Bank deposit slip",
  "Purchase bills",
  "Kitchen register",
  "Housekeeping / laundry",
  "Guest ID & check-in forms",
  "Meter & vehicle photos",
  "Other",
] as const;

/**
 * The day's paperwork. Staff open the daily link posted in the WhatsApp group
 * (/daily-filings/new/?date=YYYY-MM-DD), pick what they are filing and add photos/PDF scans.
 */
export const dailyFilings = defineEntity({
  name: "daily-filings",
  label: "Daily filing",
  labelSingular: "Filing",
  icon: FolderUp,
  table: "daily_filings",
  teams: ["operations", "accounts"],
  unitField: "business_unit_id",
  titleField: "category",
  searchFields: ["category", "note", "date"],
  defaultSort: { field: "date", dir: "desc" },
  secondarySort: { field: "created_at", dir: "desc" },
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "category", label: "What are you filing?", type: "select", options: FILING_CATEGORIES, required: true, default: "Bills & vouchers" },
    { name: "files", label: "Photos / scans", type: "files", required: true, help: "Take a clear photo of every page or bill. Add as many as you need." },
    { name: "amount", label: "Total amount (₹, if bills)", type: "money", min: 0 },
    { name: "submitted_by", label: "Filed by", type: "relation", entity: "staff", defaultToMe: true },
    { name: "note", label: "Note", type: "textarea" },
  ],
  listColumns: ["date", "category", "business_unit_id", "amount", "submitted_by"],
});
