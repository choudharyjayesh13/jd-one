/**
 * Auto-match-or-create a customer from a phone number. Used by the lead and
 * booking hooks (on save) and by their live form hint (while typing).
 */
import type { DataStore } from "@/core/data/types";
import type { FieldValues, LiveHint, Row } from "@/core/schema/types";
import { normalizePhone } from "@/core/phone";
import { formatMoney, todayISO } from "@/core/format";
import { customerHeadline } from "./stats";

export async function findCustomerByPhone(store: DataStore, phone: unknown): Promise<Row | null> {
  const p = normalizePhone(phone);
  if (!p) return null;
  const rows = await store.list("customers", { filter: { phone: p }, limit: 1 });
  return rows[0] ?? null;
}

/**
 * Returns the customer id for the given contact details, creating the customer
 * when nothing matches. Never overwrites an explicit customer_id.
 */
export async function matchOrCreateCustomer(
  store: DataStore,
  values: FieldValues,
  nameField: string,
  opts: { source?: string; staffId?: string | null } = {},
): Promise<string | null> {
  if (values.customer_id) return String(values.customer_id);
  const phone = normalizePhone(values.phone);
  if (!phone) return null;
  const existing = await findCustomerByPhone(store, phone);
  if (existing) return existing.id;
  const created = await store.create("customers", {
    name: (values[nameField] as string) || `Guest ${phone.slice(-4)}`,
    phone,
    email: (values.email as string) ?? null,
    first_source: opts.source ?? null,
    first_seen: todayISO(),
    tags: [],
    owner_id: opts.staffId ?? null,
    created_by: opts.staffId ?? null,
  });
  return created.id;
}

/** Live hint for forms that carry a phone: shows the existing customer's history. */
export async function customerLiveHint(values: FieldValues, store: DataStore): Promise<LiveHint | null> {
  const phone = normalizePhone(values.phone);
  if (phone.length < 10) return null;
  const existing = await findCustomerByPhone(store, phone);
  if (!existing) return { message: "New customer — a customer record will be created on save.", tone: "info", patch: values.customer_id ? { customer_id: null } : undefined };
  const h = await customerHeadline(store, existing.id);
  return {
    message: `Existing customer: ${existing.name as string} — ${h.stays} stay${h.stays === 1 ? "" : "s"}, ${formatMoney(h.spend)} spent${h.openLeads ? `, ${h.openLeads} open lead${h.openLeads === 1 ? "" : "s"}` : ""}`,
    tone: "success",
    patch: values.customer_id === existing.id ? undefined : { customer_id: existing.id },
  };
}
