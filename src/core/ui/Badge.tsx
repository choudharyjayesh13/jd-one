import { cn } from "./cn";

const tones: Record<string, string> = {
  // lead stages / booking statuses / task statuses share one palette
  New: "bg-sky-100 text-sky-800",
  Contacted: "bg-sky-100 text-sky-800",
  Qualified: "bg-indigo-100 text-indigo-800",
  Proposal: "bg-violet-100 text-violet-800",
  Negotiation: "bg-amber-100 text-amber-800",
  Won: "bg-emerald-100 text-emerald-800",
  Lost: "bg-red-100 text-red-800",
  "On Hold": "bg-slate-100 text-slate-700",
  Enquiry: "bg-sky-100 text-sky-800",
  Confirmed: "bg-indigo-100 text-indigo-800",
  "Checked-in": "bg-emerald-100 text-emerald-800",
  "Checked-out": "bg-slate-100 text-slate-700",
  Cancelled: "bg-red-100 text-red-800",
  "No-show": "bg-red-100 text-red-800",
  Open: "bg-amber-100 text-amber-800",
  "In progress": "bg-sky-100 text-sky-800",
  "Waiting parts": "bg-violet-100 text-violet-800",
  Done: "bg-emerald-100 text-emerald-800",
  Verified: "bg-emerald-200 text-emerald-900",
  Urgent: "bg-red-600 text-white",
  Pending: "bg-amber-100 text-amber-800",
  Approved: "bg-emerald-100 text-emerald-800",
  Rejected: "bg-red-100 text-red-800",
  Hot: "bg-red-100 text-red-800",
  Warm: "bg-amber-100 text-amber-800",
  Cold: "bg-sky-100 text-sky-800",
  Unqualified: "bg-slate-100 text-slate-700",
  High: "bg-red-100 text-red-800",
  Medium: "bg-amber-100 text-amber-800",
  Low: "bg-slate-100 text-slate-700",
  P: "bg-emerald-100 text-emerald-800",
  A: "bg-red-100 text-red-800",
  H: "bg-amber-100 text-amber-800",
  L: "bg-sky-100 text-sky-800",
};

export function Badge({ value, className }: { value: unknown; className?: string }) {
  const s = String(value ?? "");
  if (!s) return <span className="text-slate-400">—</span>;
  return <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", tones[s] ?? "bg-slate-100 text-slate-700", className)}>{s}</span>;
}
