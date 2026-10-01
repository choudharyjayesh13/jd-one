"use client";
/** App chrome: sidebar (desktop) grouped by team, bottom tab bar (phone), header. */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, LogOut, Menu, X, CalendarDays, Camera, Sun, Trophy, CalendarCheck, LayoutGrid, CalendarRange, Hotel, BarChart3, Network } from "lucide-react";
import { TEAMS } from "@/core/schema/types";
import { getEntity } from "@/core/schema/registry";
import { useAuth, useUser } from "@/core/auth/AuthProvider";
import { navGroups, isAdmin, canRead, canUpdate } from "@/core/auth/access";
import { listHref } from "@/core/routes";
import { isOpenTicket } from "@/modules/tickets/entity";
import { useList } from "./hooks";
import { cn } from "./cn";

type IconType = React.ComponentType<{ className?: string }>;

function NavLink({ href, label, icon: Icon, active, onClick, badge }: { href: string; label: string; icon: IconType; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <Link href={href} onClick={onClick} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm", active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white")}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
      {badge ? <span className="ml-auto rounded-full bg-gold px-1.5 py-0.5 text-[10px] font-semibold leading-none text-navy">{badge}</span> : null}
    </Link>
  );
}

/** Live counts shown as sidebar badges (open tickets, sign-ups waiting for approval). */
function useNavBadges(role: ReturnType<typeof useUser>["role"]) {
  const canTickets = canRead(role, getEntity("tickets"));
  const canApprove = canUpdate(role, getEntity("signup-requests"));
  const { rows: tickets } = useList(canTickets ? "tickets" : null);
  const { rows: signups } = useList(canApprove ? "signup-requests" : null, { filter: { status: "Pending" } });
  return { tickets: tickets.filter(isOpenTicket).length, signups: signups.length };
}

export function AppShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const { signOut, mode } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const groups = navGroups(user.role);
  const badges = useNavBadges(user.role);
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const badgeFor = (entity: string) => (entity === "tickets" ? badges.tickets : entity === "staff" ? badges.signups : undefined);
  const hasOps = groups.some((g) => g.team === "operations");

  const close = () => setOpen(false);

  const myDay = <NavLink href="/my-day/" label="My Day" icon={Sun} active={active("/my-day/")} onClick={close} />;
  const dashboard = <NavLink href="/" label="Dashboard" icon={LayoutDashboard} active={active("/")} onClick={close} />;
  const scoreboard = <NavLink href="/scoreboard/" label="Scoreboard" icon={Trophy} active={active("/scoreboard/")} onClick={close} />;

  const nav = (
    <nav className="flex flex-col gap-4 p-3">
      <div className="space-y-0.5">
        {/* Staff see My Day first; managers and teams start on the dashboard. */}
        {user.role === "staff" ? myDay : dashboard}
        {user.role === "staff" ? dashboard : myDay}
        <NavLink href="/attendance/checkin/" label="Mark attendance" icon={Camera} active={active("/attendance/checkin/")} onClick={close} />
        <NavLink href="/network/" label="JD One network" icon={Network} active={active("/network/")} onClick={close} />
        {groups.some((g) => g.team === "hr") && <NavLink href="/attendance/grid/" label="Attendance grid" icon={CalendarDays} active={active("/attendance/grid/")} onClick={close} />}
        {!hasOps && scoreboard}
      </div>
      {groups.map((g) => (
        <div key={g.team}>
          <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gold">{TEAMS.find((t) => t.id === g.team)?.label}</div>
          <div className="space-y-0.5">
            {/* Property (front office) mirrors the channel-manager layout: calendars first, then the registers. */}
            {g.team === "property" && (
              <>
                <NavLink href="/availability/" label="Availability calendar" icon={CalendarCheck} active={active("/availability/")} onClick={close} />
                <NavLink href="/room-chart/" label="Room chart" icon={LayoutGrid} active={active("/room-chart/")} onClick={close} />
                <NavLink href="/rates-calendar/" label="Rates calendar" icon={CalendarRange} active={active("/rates-calendar/")} onClick={close} />
              </>
            )}
            {g.entities.map((e) => (
              <NavLink key={e.name} href={listHref(e.name)} label={e.label} icon={e.icon} active={active(listHref(e.name))} onClick={close} badge={badgeFor(e.name)} />
            ))}
            {g.team === "property" && (
              <>
                <NavLink href="/reports/" label="Reports" icon={BarChart3} active={active("/reports/")} onClick={close} />
                <NavLink href="/hotel-details/" label="Hotel details" icon={Hotel} active={active("/hotel-details/")} onClick={close} />
              </>
            )}
            {g.team === "operations" && scoreboard}
          </div>
        </div>
      ))}
      {isAdmin(user.role) && (
        <div className="space-y-0.5">
          <NavLink href="/settings/" label="Settings" icon={Settings} active={active("/settings/")} onClick={close} />
        </div>
      )}
    </nav>
  );

  const modules = groups.flatMap((g) => g.entities).filter((e, i, arr) => arr.findIndex((x) => x.name === e.name) === i);
  const hasProperty = groups.some((g) => g.team === "property");
  const tabs = [
    ...(user.role === "staff" ? [{ href: "/my-day/", label: "My Day", icon: Sun as IconType }] : []),
    { href: "/", label: "Home", icon: LayoutDashboard as IconType },
    ...(hasProperty ? [{ href: "/room-chart/", label: "Rooms", icon: LayoutGrid as IconType }] : []),
    ...modules.slice(0, user.role === "staff" ? 1 : hasProperty ? 2 : 3).map((e) => ({ href: listHref(e.name), label: e.label, icon: e.icon as IconType })),
  ];

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-navy text-white lg:flex">
        <div className="flex items-center gap-2 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold text-sm font-bold text-navy">JD</span>
          <span className="text-base font-semibold">JD One</span>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="border-t border-white/10 p-3 text-xs text-slate-300">
          <div className="truncate font-medium text-white">{user.name}</div>
          <div className="capitalize">
            {user.role} · {mode === "local" ? "local mode" : "shared"}
          </div>
          <button type="button" onClick={() => void signOut()} className="mt-2 inline-flex items-center gap-1 text-slate-300 hover:text-white">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-40 flex items-center justify-between bg-navy px-4 py-3 text-white lg:hidden" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gold text-xs font-bold text-navy">JD</span>
            <span className="font-semibold">JD One</span>
          </Link>
          <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>
        {open && (
          <div className="fixed inset-0 z-30 bg-navy/60 lg:hidden" onClick={() => setOpen(false)}>
            <div className="absolute inset-y-0 right-0 w-72 overflow-y-auto bg-navy pt-14 text-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              {nav}
              <div className="border-t border-white/10 p-3 text-xs text-slate-300">
                <div className="font-medium text-white">{user.name}</div>
                <div className="capitalize">
                  {user.role} · {mode === "local" ? "local mode" : "shared"}
                </div>
                <button type="button" onClick={() => void signOut()} className="mt-2 inline-flex items-center gap-1">
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </button>
              </div>
            </div>
          </div>
        )}
        {mode === "local" && (
          <div className="bg-gold/15 px-4 py-1 text-center text-[11px] text-navy">Local mode – single device. Data lives in this browser; export it from Settings.</div>
        )}
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 pb-24 sm:px-6 lg:pb-8">{children}</main>

        {/* Mobile bottom tabs: My Day (staff) / home + first modules + menu */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", active(t.href) ? "text-navy font-medium" : "text-slate-500")}>
              <t.icon className="h-5 w-5" />
              {t.label}
            </Link>
          ))}
          <button type="button" onClick={() => setOpen(true)} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-slate-500">
            <Menu className="h-5 w-5" />
            More
          </button>
        </nav>
      </div>
    </div>
  );
}
