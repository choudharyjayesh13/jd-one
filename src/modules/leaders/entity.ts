import { Landmark } from "lucide-react";
import { defineEntity, type FieldValues } from "@/core/schema/types";

/**
 * Local leaders directory for the JD One network: panchayat (Zila Pramukh,
 * Pradhan, Sarpanch, ward panch) and urban (Mayor, Nagar Palika chairperson,
 * ward parshad) representatives, filed State → District → City/Block like the
 * rest of the network. Only publicly published details; every row keeps its source.
 */
export const LEADER_ROLES = [
  "Zila Pramukh",
  "Up-Zila Pramukh",
  "Pradhan",
  "Up-Pradhan",
  "Sarpanch",
  "Up-Sarpanch",
  "Ward Panch",
  "Mayor",
  "Deputy Mayor",
  "Nagar Palika / Parishad Chairperson",
  "Vice-Chairperson",
  "Ward Parshad (Councillor)",
  "MLA",
  "MP",
  "Other",
] as const;

export const BODY_TYPES = [
  "Zila Parishad",
  "Panchayat Samiti",
  "Gram Panchayat",
  "Municipal Corporation",
  "Nagar Parishad",
  "Nagar Palika",
  "Assembly constituency",
  "Lok Sabha constituency",
] as const;

export const PARTIES = ["BJP", "INC (Congress)", "Independent", "AAP", "BSP", "RLP", "BAP", "CPI(M)", "Other", "Not known"] as const;

/** Election symbol for the recognised parties; Independents carry their allotted symbol. */
export const PARTY_SYMBOL: Record<string, string> = {
  BJP: "Lotus",
  "INC (Congress)": "Hand",
  AAP: "Broom",
  BSP: "Elephant",
  RLP: "Bottle",
  BAP: "Hockey stick and ball",
  "CPI(M)": "Hammer, sickle and star",
};

export const LEADER_STATUS = ["In office", "Administrator (term ended)", "Former", "Election due"] as const;

export const leaders = defineEntity({
  name: "leaders",
  label: "Local leaders",
  labelSingular: "Local leader",
  icon: Landmark,
  table: "leaders",
  teams: ["operations", "marketing"],
  hidden: true, // shown as the "Local leaders" tab of the Network page
  titleField: "name",
  searchFields: ["name", "body_name", "area", "ward_no", "city", "district", "party"],
  defaultSort: { field: "district", dir: "asc" },
  secondarySort: { field: "body_name", dir: "asc" },
  permissions: { create: ["owner", "manager", "marketing"], update: ["owner", "manager", "marketing"], delete: ["owner"] },
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "role", label: "Role", type: "select", options: LEADER_ROLES, required: true, default: "Sarpanch" },
    { name: "body_type", label: "Body", type: "select", options: BODY_TYPES, required: true, default: "Gram Panchayat" },
    { name: "body_name", label: "Body name", type: "text", required: true, placeholder: "Lakadwas GP, Girwa Panchayat Samiti, Udaipur Municipal Corporation…" },
    { name: "ward_no", label: "Ward no.", type: "text" },
    { name: "area", label: "Area / villages / colonies covered", type: "textarea", wide: true },
    { name: "state", label: "State", type: "text", required: true, default: "Rajasthan" },
    { name: "district", label: "District", type: "text", required: true },
    { name: "city", label: "City / block / tehsil", type: "text", required: true },
    { name: "party", label: "Party", type: "select", options: PARTIES, default: "Not known" },
    { name: "party_symbol", label: "Election symbol", type: "text", help: "Filled in for BJP (Lotus), Congress (Hand) and other recognised parties; type it for Independents" },
    { name: "phone", label: "Office phone", type: "phone", help: "Only numbers published by the government or given by the person" },
    { name: "photo", label: "Photo", type: "file" },
    { name: "in_office_since", label: "In this post since", type: "date", help: "Effective date: oath / took charge" },
    { name: "term", label: "Term", type: "text", placeholder: "2020–2025" },
    { name: "in_politics_since", label: "In politics since (year)", type: "number", min: 1950, max: 2100, help: "First election contested or first post held" },
    { name: "previous_posts", label: "Earlier posts", type: "textarea", wide: true, placeholder: "Ward panch 2010–15, Sarpanch 2015–20…" },
    { name: "status", label: "Status", type: "select", options: LEADER_STATUS, default: "In office" },
    { name: "verified", label: "Verified", type: "boolean", default: false, help: "Tick after confirming with an official list or the person" },
    { name: "source_url", label: "Source", type: "text", wide: true, placeholder: "Link to the official result / news report" },
    { name: "notes", label: "Notes", type: "textarea", wide: true },
  ],
  listColumns: ["name", "role", "body_name", "ward_no", "party", "in_office_since", "city", "status"],
  hooks: {
    beforeSave(values: FieldValues) {
      const sym = values.party_symbol || PARTY_SYMBOL[String(values.party ?? "")] || null;
      return { ...values, party_symbol: sym };
    },
  },
});
