"use client";
/**
 * Home (/). Greets the person, then shows the day's figures for the departments they
 * work in: "Today" gathers every card for their departments, and each department has
 * its own tab. Which department sees which card is set in Administration → Home cards.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, RefreshCw, Settings2 } from "lucide-react";
import { getStore } from "@/core/data";
import type { Row } from "@/core/schema/types";
import { useUser } from "@/core/auth/AuthProvider";
import { TIMEZONE } from "@/core/format";
import { viewHref } from "@/core/routes";
import { Badge } from "@/core/ui/Badge";
import { ErrorBox, Loading } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";
import { greeting } from "@/core/ui/Welcome";
import { loadDashboard, type DashboardData } from "@/modules/dashboard/data";
import { TodaySection } from "@/modules/dashboard/Today";
import { REPORT_DEPARTMENTS, useIsPropertySupervisor } from "@/modules/night-audit/access";
import { HOME_CARDS, cardDepartments, type HomeCard, type ListCard, type StatCard } from "./cards";

const TAB_KEY = "jdone.homeTab.v3";

export { myDepartments } from "./depts";
import { myDepartments } from "./depts";

export function Home() {
  const user = useUser();
  const supervisor = useIsPropertySupervisor(user);
  const [data, setData] = useState<DashboardData | null>(null);
  const [saved, setSaved] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(() => {
    try {
      return localStorage.getItem(TAB_KEY) ?? "today";
    } catch {
      return "today";
    }
  });

  const load = () =>
    Promise.all([loadDashboard(getStore(), user.unitId), getStore().list("home-cards").catch(() => [] as Row[])])
      .then(([d, s]) => {
        setData(d);
        setSaved(s);
      })
      .catch((e) => setError((e as Error).message));

  useEffect(() => {
    void load();
    const unsubs = ["bookings", "leads", "tasks", "tickets", "stock", "expenses", "payments", "attendance", "rooms", "payment-requests", "housekeeping-reports", "petty-cash"].map((e) => getStore().subscribe?.(e, () => void load()));
    return () => unsubs.forEach((u) => u?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.unitId]);

  const mine = myDepartments(user);
  const map = useMemo(() => cardDepartments(saved), [saved]);
  const tabs = [{ id: "today", label: "Today" }, ...REPORT_DEPARTMENTS.filter((d) => mine.includes(d.id)).map((d) => ({ id: d.id, label: d.title.replace(" (Kitchen)", "") })), ...(user.post ? [{ id: "activity", label: "Activity" }] : [])];
  const current = tabs.some((t) => t.id === tab) ? tab : "today";
  const pick = (t: string) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
  };
  const cards = HOME_CARDS.filter((c) => (current === "today" ? (map[c.id] ?? []).some((d) => mine.includes(d)) : (map[c.id] ?? []).includes(current)));
  const stats = cards.filter((c): c is StatCard => c.kind === "stat");
  const lists = cards.filter((c): c is ListCard => c.kind === "list");

  const now = new Date();
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TIMEZONE }).format(now);
  const post = user.post === "chairman" ? "Chairman" : user.post === "director" ? "Director" : String(user.staff?.designation ?? "");

  return (
    <div className="pb-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">{date}</p>
          <h1 className="jd-serif mt-2 text-[clamp(34px,4.4vw,52px)] font-light leading-[1.02] text-navy">
            {greeting(now)}, <em className="font-normal italic text-[#9a7128]">{user.name.split(" ")[0]}</em>
          </h1>
          {post && <p className="mt-2 text-sm text-slate-500">{post} · The Udaisarovar</p>}
        </div>
        <div className="flex items-center gap-2">
          {(user.post || supervisor) && (
            <Link href="/home-cards/" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-xs uppercase tracking-[0.14em] text-slate-600 hover:border-navy hover:text-navy">
              <Settings2 className="h-3.5 w-3.5" /> Home cards
            </Link>
          )}
          <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs uppercase tracking-[0.14em] text-slate-600 hover:text-navy" aria-label="Refresh">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </header>

      <nav className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Home sections">
        <ul className="flex min-w-max gap-6 border-b border-line">
          {tabs.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => pick(t.id)}
                className={cn("-mb-px border-b-2 pb-2.5 text-[13px] uppercase tracking-[0.14em] transition-colors", current === t.id ? "border-[#a9802f] font-medium text-navy" : "border-transparent text-slate-500 hover:text-navy")}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {error && <ErrorBox message={error} />}
      {current === "activity" ? (
        <TodaySection />
      ) : !data ? (
        <Loading label="Loading…" />
      ) : cards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white p-8 text-center text-sm text-slate-500">Nothing to show here yet.</p>
      ) : (
        <div className="space-y-6">
          {stats.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {stats.map((c) => (
                <StatTile key={c.id} card={c} d={data} />
              ))}
            </div>
          )}
          {lists.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              {lists.map((c) => (
                <ListPanel key={c.id} card={c} d={data} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({ card, d }: { card: StatCard; d: DashboardData }) {
  const v = card.value(d);
  const body = (
    <div className="group flex h-full flex-col justify-between rounded-xl border border-line bg-white p-4 transition-colors hover:border-[#d4bf96] sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] uppercase leading-snug tracking-[0.16em] text-slate-500">{card.title}</span>
        {card.href && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-[#a9802f]" />}
      </div>
      <div>
        <div className={cn("jd-serif mt-3 text-[32px] font-semibold leading-none tabular-nums", v.tone === "bad" ? "text-red-700" : v.tone === "good" ? "text-emerald-700" : "text-navy")}>{v.value}</div>
        {v.hint && <div className="mt-1.5 truncate text-xs text-slate-500">{v.hint}</div>}
      </div>
    </div>
  );
  return card.href ? (
    <Link href={card.href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

function ListPanel({ card, d }: { card: ListCard; d: DashboardData }) {
  const rows = card.rows(d);
  return (
    <section className="rounded-xl border border-line bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="jd-serif text-xl font-semibold text-navy">
          {card.title} <span className="ml-1 font-sans text-sm font-normal text-slate-400">{rows.length}</span>
        </h2>
        {card.href && (
          <Link href={card.href} className="text-[11px] uppercase tracking-[0.16em] text-[#9a7128] hover:text-navy">
            Open
          </Link>
        )}
      </header>
      {rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-slate-500">{card.empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.slice(0, 8).map((r) => (
            <li key={r.id}>
              <Link href={viewHref(card.entity, r.id)} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-navy">{card.primary(r, d)}</span>
                  {card.secondary && <span className="block truncate text-xs text-slate-500">{card.secondary(r, d)}</span>}
                </span>
                {card.badge && card.badge(r) ? <Badge value={card.badge(r)} /> : null}
              </Link>
            </li>
          ))}
          {rows.length > 8 && <li className="px-5 py-2 text-xs text-slate-400">+{rows.length - 8} more</li>}
        </ul>
      )}
    </section>
  );
}

export type { HomeCard };
