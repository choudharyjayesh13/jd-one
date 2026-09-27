/** Shared option lists (also used by customers + importers). */
export const LEAD_SOURCES = ["Meta Ads", "Google Ads", "Website", "Instagram", "WhatsApp", "Walk-in", "Referral", "Channel Partner", "OTA", "Event", "Cold Call", "Other"] as const;
export const LEAD_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost", "On Hold"] as const;
export const LEAD_QUALIFICATIONS = ["Hot", "Warm", "Cold", "Unqualified"] as const;
export const OPEN_STAGES: readonly string[] = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "On Hold"];
