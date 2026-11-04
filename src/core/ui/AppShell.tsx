"use client";
/**
 * App chrome after sign-in (phase 1, 3 Nov 2026): black, white and gold.
 * Header: JD One · the property · bell (Chairman) · profile menu.
 * Side menu: Home, My Day, then hotel departments (from core/departments),
 * each opening to its modules. Only modules the person has access to appear;
 * planned ("soon") modules are left out until they are built.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu, X, Sun, LayoutDashboard, Camera } from "lucide-react";
import { findEntity, getEntity } from "@/core/schema/registry";
import { useAuth, useUser, type AuthUser } from "@/core/auth/AuthProvider";
import { canRead, canUpdate, isAdmin, moduleLevel } from "@/core/auth/access";
import { DEPARTMENTS, moduleHref, type Department, type ModuleDef } from "@/core/departments";
import { BRAND_STORAGE_KEY, STAYS_PROPERTIES, findBrand } from "@/core/auth/brands";
import { isOpenTicket } from "@/modules/tickets/entity";
import { canSeePerformance } from "@/modules/performance/Performance";
import { useList } from "./hooks";
import { cn } from "./cn";
import { DbUpdateStrip } from "./DbSetup";
import { canNightAudit, reportDepartments, useIsPropertySupervisor } from "@/modules/night-audit/access";
import { SHARED_PAGES, useSharedPageDepts } from "@/modules/rooms/shared";
import { Welcome } from "./Welcome";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Pages that are not tied to one entity: who saw them before Team access existed. */
function legacyPageVisible(key: string, user: AuthUser): boolean {
  const read = (entity: string) => {
    const def = findEntity(entity);
    return !!def && canRead(user.role, def);
  };
  switch (key) {
    case "room-chart":
    case "availability":
    case "rates-calendar":
    case "hotel-details":
    case "reports":
      return read("bookings");
    case "pipeline":
      return read("leads");
    case "performance":
      return canSeePerformance(user.role, user.staff);
    case "attendance":
      return read("staff");
    case "pay-qr":
    case "report-issue":
    case "scoreboard":
    case "task-board":
      return true;
    default:
      return false;
  }
}

function moduleVisible(m: ModuleDef, user: AuthUser, supervisor = false): boolean {
  if (m.soon) return false;
  if (m.key === "report-duty") return !!user.post || supervisor;
  if (m.key === "arrivals" || m.key === "departures" || m.key === "staying" || m.key === "checked-out") {
    const lvl = Math.max(moduleLevel(m.key) ?? -1, moduleLevel("checkins") ?? -1, moduleLevel("room-chart") ?? -1);
    return !!user.post || (moduleLevel("checkins") === null ? legacyPageVisible("room-chart", user) : lvl >= 1);
  }
  if (m.key === "booking-chart") {
    const lvl = Math.max(moduleLevel(m.key) ?? -1, moduleLevel("bookings") ?? -1);
    return !!user.post || (moduleLevel("bookings") === null ? legacyPageVisible("room-chart", user) : lvl >= 1);
  }
  if (m.key === "roster") {
    const lvl = moduleLevel("attendance");
    return !!user.post || (lvl === null ? legacyPageVisible("attendance", user) : lvl >= 1);
  }
  if (m.key === "night-audit") return canNightAudit(user);
  if (m.key === "dept-reports") return reportDepartments(user).length > 0;
  const lvl = moduleLevel(m.key);
  if (lvl !== null) return lvl >= 1;
  if (m.entity) {
    const def = findEntity(m.entity);
    return !!def && canRead(user.role, def);
  }
  return legacyPageVisible(m.key, user);
}

function adminModuleVisible(m: ModuleDef, user: AuthUser): boolean {
  if (m.key === "home-cards") return !!user.post;
  if (m.key === "director-changes") return user.post === "chairman";
  if (m.key === "team-access") return !!user.post;
  return isAdmin(user.role) || !!user.post;
}

/** Menu for this person: departments with at least one module they may open. */
export function useMenu(): { dept: Department; modules: ModuleDef[] }[] {
  const user = useUser();
  const supervisor = useIsPropertySupervisor(user);
  // Shared pages (Room chart) show in every department ticked in Home cards.
  const roomChart = useSharedPageDepts("room-chart");
  const rcKey = roomChart.depts.join(",");
  return useMemo(
    () =>
      DEPARTMENTS.map((dept) => {
        const own = dept.modules.filter((m) => {
          if (m.key === "room-chart") return roomChart.depts.includes(dept.id) || (!user.post && (moduleLevel("room-chart") ?? 0) >= 1);
          return (dept.adminOnly ? adminModuleVisible(m, user) : moduleVisible(m, user, supervisor)) && moduleHref(m);
        });
        const shared = SHARED_PAGES.filter((p) => p.id === "room-chart" && roomChart.depts.includes(dept.id) && !dept.modules.some((m) => m.key === p.id)).map((p) => ({ key: p.id, label: p.title, href: p.href }) as ModuleDef);
        return { dept, modules: [...shared, ...own] };
      }).filter((g) => g.modules.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, supervisor, rcKey],
  );
}

function useBadges(user: AuthUser) {
  const canTickets = canRead(user.role, getEntity("tickets"));
  const canApprove = canUpdate(user.role, getEntity("signup-requests"));
  const { rows: tickets } = useList(canTickets ? "tickets" : null);
  const { rows: signups } = useList(canApprove ? "signup-requests" : null, { filter: { status: "Pending" } });
  const { rows: changes } = useList(user.post === "chairman" ? "change-log" : null, { filter: { seen: false } });
  return { tickets: tickets.filter(isOpenTicket).length, "signup-requests": signups.length, "director-changes": changes.length } as Record<string, number>;
}

function useProperty() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setId(window.localStorage.getItem(BRAND_STORAGE_KEY));
    } catch {
      /* ignore */
    }
  }, []);
  return findBrand(id) ?? STAYS_PROPERTIES[0];
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="relative m-1 h-9 w-9 shrink-0">
        <span className="jd-orbit" aria-hidden="true" style={{ inset: -6 }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE}/icons/icon-192.png`} alt="JD Group" className="block h-9 w-9 rounded-full" />
      </span>
      <span className="jd-serif text-xl font-semibold uppercase tracking-[0.22em] text-[#17140f]">JD One</span>
    </Link>
  );
}

function SideMenu({ onNavigate, pathname }: { onNavigate: () => void; pathname: string }) {
  const user = useUser();
  const menu = useMenu();
  const badges = useBadges(user);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const currentDept = menu.find((g) => g.modules.some((m) => isActive(moduleHref(m) ?? "#")))?.dept.id;
  const [open, setOpen] = useState<Record<string, boolean>>(() => (currentDept ? { [currentDept]: true } : {}));
  useEffect(() => {
    if (currentDept) setOpen((o) => (o[currentDept] ? o : { ...o, [currentDept]: true }));
  }, [currentDept]);

  const top = [
    { href: "/", label: "Home", icon: LayoutDashboard },
    { href: "/my-day/", label: "My Day", icon: Sun },
  ];

  return (
    <nav aria-label="Main menu" className="flex flex-col gap-1 px-3 py-5">
      {top.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          onClick={onNavigate}
          className={cn("flex min-h-10 items-center gap-3 rounded px-3 text-sm", isActive(t.href) ? "bg-[#d7aa60]/15 font-medium text-[#9a7128]" : "text-[#3a332a] hover:bg-[#17140f]/[0.04] hover:text-[#17140f]")}
        >
          <t.icon className="h-4 w-4" />
          {t.label}
        </Link>
      ))}
      <div className="my-3 h-px bg-[#17140f]/[0.06]" />
      {menu.map(({ dept, modules }) => {
        const isOpen = !!open[dept.id];
        const count = modules.reduce((n, m) => n + (badges[m.key] ?? 0), 0);
        return (
          <div key={dept.id} className={cn(dept.adminOnly && "mt-3 border-t border-[#e7e1d5] pt-3")}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen((o) => ({ ...o, [dept.id]: !isOpen }))}
              className={cn("flex min-h-10 w-full items-center justify-between gap-2 rounded px-3 text-left text-[11px] uppercase tracking-[0.18em] hover:bg-[#17140f]/[0.04]", dept.adminOnly ? "text-[#9a7128]" : "text-[#17140f]")}
            >
              <span>{dept.label}</span>
              <span className="flex items-center gap-2">
                {count > 0 && !isOpen && <span className="rounded-full bg-[#ee8122] px-1.5 text-[10px] font-semibold leading-4 tracking-normal text-white">{count}</span>}
                <ChevronDown className={cn("h-4 w-4 text-[#6b6255] transition-transform", isOpen && "rotate-180")} />
              </span>
            </button>
            {isOpen && (
              <div className="mb-2 ml-3 flex flex-col border-l border-[#d7aa60]/30 pl-2">
                {modules.map((m) => {
                  const href = moduleHref(m)!;
                  const lvl = moduleLevel(m.key);
                  return (
                    <Link
                      key={m.key}
                      href={href}
                      onClick={onNavigate}
                      className={cn("flex min-h-9 items-center justify-between gap-2 rounded px-3 text-[13px]", isActive(href) ? "bg-[#d7aa60]/15 font-medium text-[#9a7128]" : "text-[#3a332a] hover:bg-[#17140f]/[0.04] hover:text-[#17140f]")}
                    >
                      <span className="truncate">{m.label}</span>
                      {badges[m.key] ? (
                        <span className="rounded-full bg-[#ee8122] px-1.5 text-[10px] font-semibold leading-4 text-white">{badges[m.key]}</span>
                      ) : lvl === 1 ? (
                        <span className="text-[9px] uppercase tracking-[0.14em] text-[#9a917f]">View</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function ProfileMenu() {
  const user = useUser();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const initials = user.name
    .split(" ")
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const postLabel = user.post === "chairman" ? "Chairman" : user.post === "director" ? "Director" : String(user.staff?.designation ?? user.role);
  const items = [
    { href: "/attendance/checkin/", label: "Mark attendance" },
    { href: "/my-documents/", label: "My documents" },
    { href: "/account/", label: "My account" },
    { href: "/report-issue/", label: "Report an issue" },
  ];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className="flex min-h-11 items-center gap-2.5 rounded-full pr-2 text-left hover:bg-[#17140f]/[0.04]">
        <span className="jd-serif flex h-9 w-9 items-center justify-center rounded-full border border-[#d7aa60] font-semibold text-[#9a7128]">{initials || "JD"}</span>
        <span className="hidden flex-col sm:flex">
          <span className="text-sm font-medium leading-tight text-[#17140f]">{user.name}</span>
          <span className="text-xs capitalize leading-tight text-[#6b6255]">{postLabel}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-[#6b6255]" />
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-md border border-[#e7e1d5] bg-white py-1 shadow-2xl">
            {items.map((i) => (
              <Link key={i.href} href={i.href} role="menuitem" onClick={() => setOpen(false)} className="flex min-h-11 items-center px-4 text-sm text-[#3a332a] hover:bg-[#17140f]/[0.04] hover:text-[#17140f]">
                {i.label}
              </Link>
            ))}
            <button type="button" role="menuitem" onClick={() => void signOut()} className="flex min-h-11 w-full items-center gap-2 border-t border-[#e7e1d5] px-4 text-left text-sm text-[#3a332a] hover:bg-[#17140f]/[0.04]">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const user = useUser();
  const { mode } = useAuth();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const property = useProperty();
  const badges = useBadges(user);
  const close = () => setDrawer(false);

  return (
    <div className="jd-light jd-sans flex min-h-screen flex-col">
      <Welcome />
      <header className="sticky top-0 z-40 flex print:hidden items-center justify-between gap-3 border-b border-[#e7e1d5] bg-white px-3 py-2.5 sm:px-6" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setDrawer(true)} className="flex h-11 w-11 items-center justify-center rounded-full text-[#3a332a] hover:bg-[#17140f]/[0.06] lg:hidden" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <Wordmark />
        </div>
        <div className="hidden items-center gap-3 md:flex">
          {property.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${BASE}/brands/${property.logo}`} alt="" className={cn("h-8 w-8 rounded-full", property.plate === "light" ? "border border-[#e7e1d5] bg-white object-contain p-1" : "object-cover")} />
          )}
          <span className="flex flex-col">
            <span className="jd-serif text-[15px] font-semibold uppercase leading-tight tracking-[0.16em] text-[#17140f]">{property.name}</span>
            <span className="text-[10px] uppercase leading-tight tracking-[0.26em] text-[#9a7128]">JD Stays &amp; Hospitality</span>
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          {user.post === "chairman" && (
            <Link href="/director-changes/" aria-label={`${badges["director-changes"] ?? 0} new Director changes`} className="relative flex h-11 w-11 items-center justify-center rounded-full border border-[#e7e1d5] text-[#17140f] hover:bg-[#17140f]/[0.04]">
              <Bell className="h-[18px] w-[18px]" />
              {badges["director-changes"] ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ee8122] px-1 text-[11px] font-semibold text-white">{badges["director-changes"]}</span>
              ) : null}
            </Link>
          )}
          <ProfileMenu />
        </div>
      </header>

      <DbUpdateStrip />
      {mode === "local" && <div className="print:hidden border-b border-[#eadfc6] bg-[#faf5ea] px-4 py-1 text-center text-[11px] text-[#7a5a1f]">Local mode – single device. Data lives in this browser; export it from Settings.</div>}

      <div className="flex flex-1">
        <aside className="sticky top-[61px] hidden print:!hidden h-[calc(100vh-61px)] w-64 shrink-0 overflow-y-auto border-r border-[#e7e1d5] lg:block">
          <SideMenu onNavigate={() => undefined} pathname={pathname} />
        </aside>

        {drawer && (
          <div className="fixed inset-0 z-50 bg-[#17140f]/40 lg:hidden" onClick={close}>
            <div className="absolute inset-y-0 left-0 w-[82%] max-w-xs overflow-y-auto border-r border-[#e7e1d5] bg-white" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-[#e7e1d5] px-3 py-2.5" style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}>
                <Wordmark />
                <button type="button" onClick={close} className="flex h-11 w-11 items-center justify-center rounded-full text-[#3a332a] hover:bg-[#17140f]/[0.06]" aria-label="Close menu">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <SideMenu onNavigate={close} pathname={pathname} />
            </div>
          </div>
        )}

        <main className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-5 pb-24 sm:px-8 lg:pb-10">{children}</main>
      </div>

      {/* Phone: the few things people open all day */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid print:hidden grid-cols-4 border-t border-[#e7e1d5] bg-white lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {[
          { href: "/", label: "Home", icon: LayoutDashboard },
          { href: "/my-day/", label: "My Day", icon: Sun },
          { href: "/attendance/checkin/", label: "Attendance", icon: Camera },
        ].map((t) => {
          const on = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href} className={cn("flex min-h-14 flex-col items-center justify-center gap-1 text-[11px]", on ? "font-medium text-[#9a7128]" : "text-[#6b6255]")}>
              <t.icon className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setDrawer(true)} className="flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] text-[#6b6255]">
          <Menu className="h-5 w-5" />
          Menu
        </button>
      </nav>
    </div>
  );
}
