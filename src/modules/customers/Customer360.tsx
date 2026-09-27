"use client";
/**
 * Customer 360° view: lifetime stats, merged timeline of every interaction,
 * per-type tabs and the two quick actions staff use most.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BedDouble, MessageSquarePlus, Pencil, Phone, Trash2 } from "lucide-react";
import { getEntity } from "@/core/schema/registry";
import { getStore } from "@/core/data";
import { deleteRecord } from "@/core/data/service";
import { formatDate, formatDateTime, formatMoney } from "@/core/format";
import { formatPhone } from "@/core/phone";
import { useUser } from "@/core/auth/AuthProvider";
import { canDelete } from "@/core/auth/access";
import { listHref, newHref, viewHref } from "@/core/routes";
import { Button } from "@/core/ui/Button";
import { Badge } from "@/core/ui/Badge";
import { Dialog } from "@/core/ui/Dialog";
import { EntityForm } from "@/core/ui/EntityForm";
import { EntityList } from "@/core/ui/EntityList";
import { FieldValue } from "@/core/ui/FieldValue";
import { useRecord, useRelationMaps } from "@/core/ui/hooks";
import { Loading, ErrorBox, PageHeader } from "@/core/ui/misc";
import { useToast } from "@/core/ui/Toast";
import { cn } from "@/core/ui/cn";
import { loadCustomerData, type CustomerStats } from "./stats";

type Timeline = { date: string; kind: string; title: string; detail: string; href: string; badge?: unknown }[];

function buildTimeline(d: Awaited<ReturnType<typeof loadCustomerData>>): Timeline {
  const items: Timeline = [];
  for (const b of d.bookings)
    items.push({ date: String(b.check_in ?? b.created_at), kind: "Booking", title: `${b.unit_type ?? "Stay"} · ${formatDate(b.check_in)} → ${formatDate(b.check_out)}`, detail: `${formatMoney(b.total)} · ${b.source ?? ""}`, href: viewHref("bookings", b.id), badge: b.status });
  for (const p of d.payments) items.push({ date: String(p.date ?? p.created_at), kind: "Payment", title: `${formatMoney(p.amount)} received`, detail: `${p.mode ?? ""} ${p.reference ? `· ${p.reference}` : ""}`, href: viewHref("payments", p.id) });
  for (const l of d.leads) items.push({ date: String(l.created_at), kind: "Lead", title: `${l.source ?? "Lead"} ${l.campaign ? `· ${l.campaign}` : ""}`, detail: String(l.requirement ?? ""), href: viewHref("leads", l.id), badge: l.stage });
  for (const a of d.activities) items.push({ date: String(a.at ?? a.created_at), kind: "Activity", title: `${a.type ?? "Activity"}: ${a.summary ?? ""}`, detail: a.next_action ? `Next: ${a.next_action} ${a.next_action_date ? formatDate(a.next_action_date) : ""}` : "", href: viewHref("activities", a.id) });
  for (const t of d.tasks) items.push({ date: String(t.due ?? t.created_at), kind: "Task", title: String(t.title ?? "Task"), detail: `${t.type ?? ""} · due ${formatDate(t.due)}`, href: viewHref("tasks", t.id), badge: t.status });
  for (const m of d.messages)
    items.push({
      date: String(m.sent_at ?? m.created_at),
      kind: "WhatsApp",
      title: `${m.direction === "out" ? "Sent" : "Received"}${m.media_type ? ` (${m.media_type})` : ""}: ${String(m.body ?? "").slice(0, 160)}`,
      detail: `${m.account ?? ""} line${m.sender_name ? ` · ${m.sender_name}` : ""}`,
      href: viewHref("messages", m.id),
      badge: m.direction === "out" ? "sent" : "received",
    });
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

const kindColor: Record<string, string> = { Booking: "bg-indigo-500", Payment: "bg-emerald-500", Lead: "bg-sky-500", Activity: "bg-amber-500", Task: "bg-slate-400", WhatsApp: "bg-green-500" };

export function Customer360({ id }: { id: string }) {
  const def = getEntity("customers");
  const user = useUser();
  const router = useRouter();
  const { toast, confirm } = useToast();
  const { row, loading, error, reload } = useRecord("customers", id);
  const maps = useRelationMaps(def);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadCustomerData>> | null>(null);
  const [tab, setTab] = useState<"timeline" | "bookings" | "leads" | "activities" | "payments" | "tasks" | "messages" | "details">("timeline");
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);

  const loadAll = useCallback(() => loadCustomerData(getStore(), id).then((d) => setData(d)), [id]);
  useEffect(() => {
    void loadAll();
    const unsubs = ["bookings", "payments", "leads", "activities", "tasks", "messages"].map((e) => getStore().subscribe?.(e, () => void loadAll()));
    return () => unsubs.forEach((u) => u?.());
  }, [loadAll]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!row) return <ErrorBox message="Customer not found." />;

  const s: CustomerStats | null = data?.stats ?? null;
  const staffId = (user.staff?.id as string | undefined) ?? null;
  const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];

  const remove = async () => {
    if (!(await confirm("Delete this customer? Linked leads and bookings stay but lose the link."))) return;
    await deleteRecord("customers", id, { store: getStore(), staffId });
    toast("Customer deleted");
    router.push(listHref("customers"));
  };

  const stat = (label: string, value: string | number | null | undefined, hint?: string) => (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-base font-semibold text-navy">{value ?? "—"}</div>
      {hint && <div className="text-[11px] text-slate-500">{hint}</div>}
    </div>
  );

  const tabs: { id: typeof tab; label: string }[] = [
    { id: "timeline", label: "Timeline" },
    { id: "bookings", label: `Bookings (${data?.bookings.length ?? 0})` },
    { id: "leads", label: `Leads (${data?.leads.length ?? 0})` },
    { id: "activities", label: `Activities (${data?.activities.length ?? 0})` },
    { id: "payments", label: `Payments (${data?.payments.length ?? 0})` },
    { id: "tasks", label: `Tasks (${data?.tasks.length ?? 0})` },
    { id: "messages", label: `WhatsApp (${data?.messages.length ?? 0})` },
    { id: "details", label: "Details" },
  ];

  return (
    <div>
      <PageHeader
        title={String(row.name)}
        back={listHref("customers")}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <a href={`tel:${row.phone}`} className="inline-flex items-center gap-1 text-navy">
              <Phone className="h-3.5 w-3.5" /> {formatPhone(row.phone)}
            </a>
            {row.city ? <span>· {String(row.city)}</span> : null}
            {tags.map((t) => (
              <Badge key={t} value={t} />
            ))}
          </span>
        }
        actions={
          <>
            <Button icon={MessageSquarePlus} variant="secondary" onClick={() => setLogging(true)}>
              Log activity
            </Button>
            <Button icon={BedDouble} onClick={() => router.push(newHref("bookings", { customer_id: id, guest_name: row.name, phone: row.phone }))}>
              New booking
            </Button>
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
              Edit
            </Button>
            {canDelete(user.role, def) && <Button variant="ghost" icon={Trash2} onClick={() => void remove()} aria-label="Delete" />}
          </>
        }
      />

      {/* Lifetime stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {stat("Stays", s?.stays ?? 0, s?.cancelled ? `${s.cancelled} cancelled` : undefined)}
        {stat("Nights", s?.nights ?? 0)}
        {stat("Total spend", formatMoney(s?.spend ?? 0))}
        {stat("Avg rate / night", s?.avgRate ? formatMoney(s.avgRate) : "—")}
        {stat("Last visit", s?.lastVisit ? formatDate(s.lastVisit) : "—")}
        {stat("Next booking", s?.nextBooking ? formatDate(s.nextBooking) : "—")}
        {stat("Open leads", s?.openLeads ?? 0)}
        {stat("Last activity", s?.lastActivity ? formatDate(s.lastActivity) : "—")}
        {stat("Favourite unit", s?.favouriteUnitType ?? "—", s?.favouriteMealPlan ? `Meal plan ${s.favouriteMealPlan}` : undefined)}
        {stat("Typical group", s?.typicalGroupSize ? `${s.typicalGroupSize} guests` : "—")}
        {stat("Booking window", s?.bookingWindowDays !== null && s?.bookingWindowDays !== undefined ? `~${s.bookingWindowDays} days ahead` : "—")}
        {stat("Weekend stays", s?.weekendShare !== null && s?.weekendShare !== undefined ? `${s.weekendShare}%` : "—", s?.weekendShare !== null && s?.weekendShare !== undefined ? (s.weekendShare >= 50 ? "Prefers weekends" : "Prefers weekdays") : undefined)}
      </div>

      {Boolean(row.preferences || row.notes) && (
        <div className="mt-3 rounded-xl border border-gold/40 bg-gold/5 px-4 py-3 text-sm text-slate-800">
          {row.preferences ? (
            <p>
              <span className="font-medium">Preferences:</span> {String(row.preferences)}
            </p>
          ) : null}
          {row.notes ? (
            <p className="mt-1">
              <span className="font-medium">Notes:</span> {String(row.notes)}
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-6 mb-3 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", t.id === tab ? "border-gold text-navy" : "border-transparent text-slate-500 hover:text-navy")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "timeline" && (
        <ol className="space-y-2">
          {!data && <Loading />}
          {data && buildTimeline(data).length === 0 && <p className="text-sm text-slate-500">No interactions yet. Log an activity or create a booking.</p>}
          {data &&
            buildTimeline(data).map((it, i) => (
              <li key={i}>
                <Link href={it.href} className="flex gap-3 rounded-xl border border-line bg-white p-3 shadow-sm hover:bg-slate-50">
                  <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", kindColor[it.kind])} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-navy">
                        <span className="text-slate-500">{it.kind} · </span>
                        {it.title}
                      </span>
                      <span className="text-xs text-slate-500">{it.date.length > 10 ? formatDateTime(it.date) : formatDate(it.date)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      {it.badge ? <Badge value={it.badge} /> : null}
                      <span className="truncate">{it.detail}</span>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
        </ol>
      )}
      {tab !== "timeline" && tab !== "details" && <EntityList key={tab} entity={tab} fixedFilter={{ customer_id: id }} newPrefill={{ customer_id: id, ...(tab === "bookings" || tab === "leads" ? { guest_name: row.name, name: row.name, phone: row.phone, email: row.email } : {}) }} embedded />}
      {tab === "details" && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-line bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-3">
          {def.fields.map((f) => (
            <div key={f.name} className={cn(f.type === "textarea" && "sm:col-span-2 lg:col-span-3")}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{f.label}</dt>
              <dd className="mt-0.5 text-sm text-slate-900">
                <FieldValue field={f} value={row[f.name]} maps={maps} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      <Dialog open={editing} onClose={() => setEditing(false)} title="Edit customer" wide>
        {editing && (
          <EntityForm
            entity="customers"
            id={id}
            onSaved={() => {
              setEditing(false);
              void reload();
            }}
            onCancel={() => setEditing(false)}
          />
        )}
      </Dialog>
      <Dialog open={logging} onClose={() => setLogging(false)} title="Log activity" wide>
        {logging && (
          <EntityForm
            entity="activities"
            prefill={{ customer_id: id, lead_id: data?.leads.find((l) => !["Won", "Lost"].includes(String(l.stage)))?.id ?? "" }}
            onSaved={() => {
              setLogging(false);
              void loadAll();
            }}
            onCancel={() => setLogging(false)}
          />
        )}
      </Dialog>
    </div>
  );
}
