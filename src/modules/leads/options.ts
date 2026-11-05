/** Shared option lists (also used by customers + importers). */
export const LEAD_SOURCES = ["Meta Ads", "Google Ads", "Website", "Instagram", "WhatsApp", "Walk-in", "Referral", "Channel Partner", "OTA", "Event", "Cold Call", "Corporate", "Other"] as const;

/** Sales pipeline stages (Uday Sarovar sales SOP, Oct 2026). Old names are mapped by a DB trigger. */
export const LEAD_STAGES = [
  "New",
  "Contact attempted",
  "Contacted",
  "Qualified",
  "Quote preparation",
  "Awaiting approval",
  "Quote shared",
  "Confirmation pending",
  "Won",
  "Lost",
  "Nurture",
] as const;
export const LEAD_QUALIFICATIONS = ["Hot", "Warm", "Cold", "Unqualified"] as const;
export const OPEN_STAGES: readonly string[] = LEAD_STAGES.filter((s) => s !== "Won" && s !== "Lost");
export const LEAD_TYPES = ["Stay", "Villa buyout", "Wedding", "Event / party", "Corporate", "Day outing", "Camping", "Other"] as const;
export const APPROVAL_STATUSES = ["Not needed", "Pending", "Approved", "Revision required", "Rejected"] as const;
export const LOST_REASONS = ["Price", "Dates unavailable", "No response", "Chose competitor", "Guest cancelled", "Budget", "Other"] as const;

/** One line per stage — what it means and when to move on (shown on the pipeline board). */
export const STAGE_GUIDE: Record<string, { no: string; means: string; exit: string; color: string }> = {
  New: { no: "01", means: "Enquiry received (Meta, WhatsApp, call, referral, website, agent, corporate).", exit: "Call / WhatsApp promptly → Contact attempted", color: "#64748b" },
  "Contact attempted": { no: "02", means: "First call/WhatsApp sent, guest not connected yet.", exit: "Guest replies → Contacted (set next follow-up)", color: "#0ea5e9" },
  Contacted: { no: "03", means: "Two-way contact — guest replied or spoke.", exit: "Collect dates, pax, rooms, budget, occasion", color: "#0284c7" },
  Qualified: { no: "04", means: "Dates, guests, rooms, occasion, budget and decision timeline captured.", exit: "Enough detail to prepare a package", color: "#4f46e5" },
  "Quote preparation": { no: "05", means: "Preparing options from the approved rate card.", exit: "Quote ready; exceptions go for approval", color: "#7c3aed" },
  "Awaiting approval": { no: "06", means: "Rate, discount or special inclusion sent to Akshayraj.", exit: "Approved or Revision required", color: "#c026d3" },
  "Quote shared": { no: "07", means: "Only the approved quote shared; follow-up & objections.", exit: "Guest accepts, revises or declines", color: "#db2777" },
  "Confirmation pending": { no: "08", means: "Guest wants to book; advance/details pending.", exit: "Advance received → Won, or Lost/Nurture", color: "#ea580c" },
  Won: { no: "09", means: "Booking confirmed, payment done.", exit: "Hand over to operations", color: "#16a34a" },
  Lost: { no: "10", means: "Declined, dates gone, price, competitor or no response.", exit: "Record the reason", color: "#dc2626" },
  Nurture: { no: "11", means: "Not ready now — future date, season or budget timing.", exit: "Set a dated follow-up, re-open when active", color: "#a16207" },
};
