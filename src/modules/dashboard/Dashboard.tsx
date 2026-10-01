"use client";
/** The single dashboard: sections by role; owner/manager get a Team view switcher. */
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { TEAMS, teamsForRole, type Team } from "@/core/schema/types";
import { getStore } from "@/core/data";
import { useUser } from "@/core/auth/AuthProvider";
import { isAdmin } from "@/core/auth/access";
import { formatDate, formatMonth } from "@/core/format";
import { Button } from "@/core/ui/Button";
import { Loading, ErrorBox, PageHeader } from "@/core/ui/misc";
import { cn } from "@/core/ui/cn";
import { loadDashboard, type DashboardData } from "./data";
import { AccountsSection, FinanceSection, HrSection, MarketingSection, OperationsSection, OverviewSection, PropertySection } from "./sections";

type Tab = "all" | Team;
const TAB_KEY = "jdone.dashboardTab";

const sectionFor: Record<Team, (d: DashboardData) => React.ReactNode> = {
  property: (d) => <PropertySection d={d} />,
  operations: (d) => <OperationsSection d={d} />,
  marketing: (d) => <MarketingSection d={d} />,
  accounts: (d) => <AccountsSection d={d} />,
  finance: (d) => <FinanceSection d={d} />,
  hr: (d) => <HrSection d={d} />,
};

export function Dashboard() {
  const user = useUser();
  const admin = isAdmin(user.role);
  const myTeams = teamsForRole(user.role);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Remember the last team tab on this device. Safe to read localStorage here:
  // the dashboard only renders on the client (behind AuthGate).
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const saved = typeof window !== "undefined" ? (localStorage.getItem(TAB_KEY) as Tab | null) : null;
      return saved && (saved === "all" || TEAMS.some((t) => t.id === saved)) ? saved : "all";
    } catch {
      return "all";
    }
  });

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      loadDashboard(getStore(), user.unitId)
        .then((d) => !cancelled && setData(d))
        .catch((e) => !cancelled && setError((e as Error).message));
    void load();
    const unsubs = ["bookings", "leads", "tasks", "tickets", "activities", "stock", "daily-reports", "expenses", "payments", "attendance", "customers", "targets", "rooms", "rates", "payment-requests", "housekeeping-reports", "petty-cash"].map((e) => getStore().subscribe?.(e, () => void load()));
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u?.());
    };
  }, [user.unitId]);

  const pick = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        subtitle={data ? `${formatDate(data.today)} · ${formatMonth(data.month)}${user.unitId ? " · your unit" : ""}` : undefined}
        actions={
          <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => loadDashboard(getStore(), user.unitId).then(setData)}>
            Refresh
          </Button>
        }
      />
      {admin && (
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm">
          {[{ id: "all" as Tab, label: "All" }, ...TEAMS.map((t) => ({ id: t.id as Tab, label: t.label }))].map((t) => (
            <button key={t.id} type="button" onClick={() => pick(t.id)} className={cn("whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium", tab === t.id ? "bg-navy text-white" : "text-slate-600 hover:bg-slate-100")}>
              {t.label}
            </button>
          ))}
        </div>
      )}
      {error && <ErrorBox message={error} />}
      {!data ? (
        <Loading label="Loading dashboard…" />
      ) : admin ? (
        tab === "all" ? (
          <OverviewSection d={data} />
        ) : (
          sectionFor[tab](data)
        )
      ) : (
        <div className="space-y-6">
          {myTeams.map((t) => (
            <div key={t}>
              {myTeams.length > 1 && <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{TEAMS.find((x) => x.id === t)?.label}</h2>}
              {sectionFor[t](data)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
