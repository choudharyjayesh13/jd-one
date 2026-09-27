import { ClipboardList } from "lucide-react";
import { defineEntity } from "@/core/schema/types";
import { todayISO } from "@/core/format";

export const dailyReports = defineEntity({
  name: "daily-reports",
  label: "Daily reports",
  labelSingular: "Daily report",
  icon: ClipboardList,
  table: "daily_reports",
  teams: ["operations", "accounts", "finance"],
  unitField: "business_unit_id",
  titleField: "date",
  searchFields: ["remarks", "date"],
  defaultSort: { field: "date", dir: "desc" },
  unique: [["date", "business_unit_id"]],
  fields: [
    { name: "date", label: "Date", type: "date", required: true, default: todayISO },
    { name: "business_unit_id", label: "Business unit", type: "relation", entity: "business-units", required: true },
    { name: "sales_cash", label: "Sales – cash", type: "money", min: 0, default: 0 },
    { name: "sales_online", label: "Sales – online", type: "money", min: 0, default: 0 },
    { name: "sales_total", label: "Sales – total", type: "money", computed: (v) => Number(v.sales_cash ?? 0) + Number(v.sales_online ?? 0) },
    { name: "occupancy_units", label: "Occupied units", type: "number", min: 0 },
    { name: "submitted_by", label: "Submitted by", type: "relation", entity: "staff" },
    { name: "remarks", label: "Remarks", type: "textarea" },
  ],
  listColumns: ["date", "business_unit_id", "sales_cash", "sales_online", "sales_total", "occupancy_units", "submitted_by"],
});
