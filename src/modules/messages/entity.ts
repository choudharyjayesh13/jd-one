import { MessageCircle } from "lucide-react";
import { ADMIN_ROLES, defineEntity } from "@/core/schema/types";

/**
 * WhatsApp messages exchanged with customers on the business lines.
 * Rows are written by `scripts/sync-whatsapp.ts` (reads the WhatsApp bridges on
 * Jayesh's Mac) — staff only read them on the customer 360° timeline and in the
 * /messages inbox. `external_id` + `account` make every sync idempotent.
 */
export const messages = defineEntity({
  name: "messages",
  label: "WhatsApp messages",
  labelSingular: "Message",
  icon: MessageCircle,
  table: "messages",
  teams: ["marketing", "operations"],
  titleField: "body",
  searchFields: ["body", "sender_phone", "sender_name"],
  defaultSort: { field: "sent_at", dir: "desc" },
  permissions: { create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ["owner"] },
  unique: [["account", "external_id"]],
  fields: [
    { name: "customer_id", label: "Customer", type: "relation", entity: "customers" },
    { name: "account", label: "Business line", type: "select", options: ["udaisarovar", "pronite", "personal"], required: true, default: "udaisarovar" },
    { name: "direction", label: "Direction", type: "select", options: ["in", "out"], required: true, default: "in" },
    { name: "sent_at", label: "Sent at", type: "datetime", required: true },
    { name: "sender_phone", label: "Phone", type: "phone" },
    { name: "sender_name", label: "WhatsApp name", type: "text" },
    { name: "body", label: "Message", type: "textarea", wide: true },
    { name: "media_type", label: "Media", type: "text" },
    { name: "media_url", label: "Media link", type: "text" },
    { name: "channel", label: "Channel", type: "text", default: "whatsapp", hidden: true },
    { name: "chat_jid", label: "Chat id", type: "text", hidden: true },
    { name: "external_id", label: "WhatsApp message id", type: "text", hidden: true },
  ],
  listColumns: ["sent_at", "direction", "sender_name", "sender_phone", "body", "account", "customer_id"],
});
