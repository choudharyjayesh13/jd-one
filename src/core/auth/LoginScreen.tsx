"use client";
/**
 * /login, in four steps:
 *   1. JD logo with a spinning orange ring while the app loads,
 *   2. JD Group: every business as a round logo (JD Stays & Hospitality last),
 *   3. JD Stays & Hospitality: its properties pop in one by one,
 *   4. sign in (or create an account) under the chosen business's logo.
 * PIN (local mode) or email + password (Supabase mode) as before; Supabase mode
 * also shows "Pending approval" for accounts that have no staff record yet.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/core/data";
import { useAuth } from "./AuthProvider";
import { BRANDS, BRAND_STORAGE_KEY, JD_STAYS, STAYS_PROPERTIES, findBrand, type Brand } from "./brands";
import { cn } from "@/core/ui/cn";
import { InstallSheet } from "./InstallSheet";

type Unit = { id: string; name: string; short_code: string | null; active: boolean };
type Stage = "splash" | "group" | "stays" | "form";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const SPLASH_MS = 2800;

/** Business units for the sign-up form, read with the anon key (policy "anon read active units"). */
async function loadUnitsAnon(): Promise<Unit[]> {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.from("business_units").select("id,name,short_code,active").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Unit[];
}

function readBrand(): string | null {
  try {
    return window.localStorage.getItem(BRAND_STORAGE_KEY);
  } catch {
    return null;
  }
}
function saveBrand(id: string) {
  try {
    window.localStorage.setItem(BRAND_STORAGE_KEY, id);
  } catch {
    /* private mode: just don't remember */
  }
}

const isStaysProperty = (b: Brand | null) => !!b && STAYS_PROPERTIES.some((p) => p.id === b.id);

/* ---------- small building blocks ---------- */

function Diamond() {
  return (
    <span className="flex items-center gap-3" aria-hidden="true">
      <span className="h-px w-20 bg-gradient-to-r from-transparent to-[#d7aa60]" />
      <span className="h-[7px] w-[7px] rotate-45 bg-[#d7aa60]" />
      <span className="h-px w-20 bg-gradient-to-r from-[#d7aa60] to-transparent" />
    </span>
  );
}

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("text-[11px] uppercase tracking-[0.34em] text-[#9a7128]", className)}>{children}</span>;
}

/** A logo on a round plate. */
function LogoCircle({ brand, size }: { brand: Brand; size: number | string }) {
  const px = typeof size === "number" ? `${size}px` : size;
  const plate = brand.plate === "light" ? "border border-[#e7e1d5] bg-white" : brand.plate === "cover" ? "bg-[#ee8122]" : "border border-[#d7aa60]/45 bg-[#17140f]";
  return (
    <span className={cn("jd-plate flex shrink-0 items-center justify-center overflow-hidden rounded-full transition-shadow", plate)} style={{ width: px, height: px }}>
      {brand.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${BASE}/brands/${brand.logo}`}
          alt={`${brand.name} logo`}
          className={brand.plate === "cover" ? "h-full w-full object-cover" : "max-h-[68%] max-w-[68%] object-contain"}
        />
      ) : (
        <span className="jd-serif font-semibold tracking-[0.1em] text-[#9a7128]" style={{ fontSize: `calc(${px} * 0.26)` }}>
          {brand.initials}
        </span>
      )}
    </span>
  );
}

function BrandButton({ brand, size, delay, onClick }: { brand: Brand; size: number; delay: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="jd-circ jd-pop flex flex-col items-center gap-3.5 text-center text-[#17140f] outline-none" style={{ animationDelay: `${delay}s` }}>
      <LogoCircle brand={brand} size={size} />
      <span className="flex flex-col items-center gap-1">
        <span className="jd-serif text-xl font-semibold tracking-[0.04em]">{brand.name}</span>
        <span className="text-[10px] uppercase tracking-[0.22em] text-[#9a7128]">{brand.tagline}</span>
      </span>
    </button>
  );
}

function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 self-start text-xs uppercase tracking-[0.2em] text-[#9a7128] hover:text-[#9a7128]">
      {children}
    </button>
  );
}

const fieldLabel = "flex flex-col gap-2 text-[11px] uppercase tracking-[0.24em] text-[#3a332a]";
const fieldInput =
  "min-h-[52px] rounded-[4px] border border-[#d9d1c2] bg-white px-4 text-base normal-case tracking-normal text-[#17140f] placeholder:text-[#9a917f] outline-none focus:border-[#d7aa60]";

function DarkField({ label, children, help }: { label: string; children: ReactNode; help?: string }) {
  return (
    <label className={fieldLabel}>
      {label}
      {children}
      {help && <span className="text-xs normal-case tracking-normal text-[#6b6255]">{help}</span>}
    </label>
  );
}

/* ---------- the screen ---------- */

export function LoginScreen() {
  const { mode, loading, user, pinSet, pendingSignup, signInWithPassword, signUp, unlockWithPin, createPin, signOut } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [stage, setStage] = useState<Stage>("splash");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "", designation: "", business_unit_id: "" });
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(next.startsWith("/") ? next : "/");
  }, [loading, user, router, next]);

  // Loading screen, then the JD Group page.
  useEffect(() => {
    const t = window.setTimeout(() => setStage((s) => (s === "splash" ? "group" : s)), SPLASH_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    setBrandId(readBrand());
  }, []);

  useEffect(() => {
    if (mode !== "supabase" || tab !== "signup" || units.length) return;
    loadUnitsAnon().then(setUnits, (e: Error) => setUnitsError(e.message));
  }, [mode, tab, units.length]);

  const brand = findBrand(brandId) ?? JD_STAYS;

  const choose = (b: Brand) => {
    setBrandId(b.id);
    saveBrand(b.id);
    setError(null);
    setDone(null);
    setStage("form");
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "local") {
        if (!/^\d{4}$/.test(pin)) throw new Error("PIN must be 4 digits");
        if (!pinSet) {
          if (pin !== pin2) throw new Error("PINs do not match");
          await createPin(pin);
        } else if (!(await unlockWithPin(pin))) throw new Error("Wrong PIN");
      } else if (tab === "signup") {
        if (!form.name.trim() || !form.email.trim() || !form.password) throw new Error("Name, email and password are required");
        if (form.password.length < 6) throw new Error("Password must be at least 6 characters");
        if (!form.business_unit_id) throw new Error("Choose your business unit");
        const { needsEmailConfirmation } = await signUp({ ...form, name: form.name.trim(), email: form.email.trim().toLowerCase(), phone: form.phone.trim(), designation: form.designation.trim() });
        setDone(needsEmailConfirmation ? "Check your email to confirm, then sign in. Your account is activated once JD Group approves it." : "Account created. Your account is activated once JD Group approves it.");
      } else {
        await signInWithPassword(email.trim(), password);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setF = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openInstall = () => {
    setMenuOpen(false);
    setInstallOpen(true);
  };

  // ⋮ menu (top right) with "Download app", on every screen after the loader.
  const shell = (children: ReactNode, withMenu = true) => (
    <div className="jd-sans relative min-h-screen w-full bg-white text-[#17140f]">
      {children}
      {withMenu && (
        <div className="absolute right-3 top-3 z-40 sm:right-6 sm:top-5">
          <button
            type="button"
            aria-label="Menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#3a332a] hover:bg-[#17140f]/[0.06] hover:text-[#17140f]"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="12" cy="19" r="1.8" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <button type="button" aria-label="Close menu" className="fixed inset-0 cursor-default" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="jd-rise absolute right-0 mt-2 w-56 overflow-hidden rounded-[6px] border border-[#e7e1d5] bg-white py-1 shadow-2xl">
                <button type="button" role="menuitem" onClick={openInstall} className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm hover:bg-[#17140f]/[0.04]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#9a7128]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                  </svg>
                  Download app
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} />
    </div>
  );

  // 1. Loading: JD logo with the spinning orange ring (also covers the auth check).
  if (stage === "splash" || loading) {
    return shell(
      <div className="flex min-h-screen flex-col items-center justify-center gap-10 px-6">
        <div className="relative h-[150px] w-[150px]">
          <span className="jd-ring" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE}/icons/icon-512.png`} alt="JD Group" className="block h-[150px] w-[150px] rounded-full" />
        </div>
        <div className="jd-rise flex flex-col items-center gap-3 text-center">
          <span className="jd-serif pl-[0.24em] text-4xl font-semibold uppercase tracking-[0.24em]">JD Group</span>
          <Eyebrow className="pl-[0.34em]">of companies · Udaipur · since 1995</Eyebrow>
        </div>
        <div className="h-0.5 w-56 overflow-hidden rounded bg-[#17140f]/[0.06]">
          <div className="jd-bar" />
        </div>
        {!loading && (
          <button type="button" onClick={() => setStage("group")} className="min-h-11 px-4 text-xs uppercase tracking-[0.2em] text-[#6b6255] hover:text-[#17140f]">
            Skip
          </button>
        )}
      </div>,
      false,
    );
  }

  // Signed in, but not a staff member yet: waiting for HR.
  if (mode === "supabase" && pendingSignup) {
    const rejected = pendingSignup.status === "Rejected";
    return shell(
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="jd-rise flex w-full max-w-md flex-col gap-6 text-center">
          <div className="mx-auto">
            <LogoCircle brand={brand} size={120} />
          </div>
          <div className="flex flex-col items-center gap-3">
            <Eyebrow>{rejected ? "Sign-up not approved" : "Pending approval"}</Eyebrow>
            <h1 className="jd-serif text-4xl font-medium">
              Hi <em className="text-[#9a7128]">{pendingSignup.name.split(" ")[0]}</em>
            </h1>
            <Diamond />
          </div>
          <p className="font-light text-[#3a332a]">
            {rejected ? "JD Group did not approve this account." : "Your account is waiting for JD Group (HR) to approve it. We'll notify you — then just sign in again."}
          </p>
          {pendingSignup.note && <p className="italic text-[#3a332a]">“{pendingSignup.note}”</p>}
          {pendingSignup.email && <p className="text-xs text-[#6b6255]">Signed in as {pendingSignup.email}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => window.location.reload()} className="jd-gold-btn min-h-[52px] flex-1 rounded-[4px] text-xs font-medium uppercase tracking-[0.24em]">
              Check again
            </button>
            <button type="button" onClick={() => void signOut()} className="min-h-[52px] rounded-[4px] border border-[#d9d1c2] px-6 text-xs uppercase tracking-[0.24em] text-[#17140f]">
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. JD Group: every business, JD Stays & Hospitality last.
  if (stage === "group") {
    return shell(
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-12 px-5 pb-16 pt-12 sm:px-10 lg:px-16">
        <header className="jd-rise flex flex-col items-center gap-6 text-center">
          <div className="relative h-28 w-28">
            <span className="jd-orbit" aria-hidden="true" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${BASE}/icons/icon-512.png`} alt="JD Group" className="block h-28 w-28 rounded-full" />
          </div>
          <div className="flex flex-col items-center gap-3">
            <h1 className="jd-serif pl-[0.24em] text-[clamp(34px,4vw,52px)] font-semibold uppercase leading-none tracking-[0.24em]">JD Group</h1>
            <Diamond />
            <Eyebrow className="pl-[0.34em]">Of companies · choose your business</Eyebrow>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
          {BRANDS.map((b, i) => (
            <BrandButton key={b.id} brand={b} size={140} delay={0.06 * i} onClick={() => choose(b)} />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setStage("stays")}
          className="jd-circ flex flex-wrap items-center gap-9 rounded-[22px] border border-[#d7aa60]/45 bg-white p-8 text-left text-[#17140f] hover:border-[#d7aa60]/80"
        >
          <span className="relative m-3 shrink-0">
            <span className="jd-orbit gold" aria-hidden="true" />
            <LogoCircle brand={JD_STAYS} size={200} />
          </span>
          <span className="flex min-w-[260px] flex-1 flex-col gap-3.5">
            <Eyebrow>Hotels &amp; resorts</Eyebrow>
            <span className="jd-serif text-[clamp(28px,3.4vw,44px)] font-semibold uppercase leading-tight tracking-[0.14em]">JD Stays &amp; Hospitality</span>
            <span className="flex flex-wrap gap-2">
              {STAYS_PROPERTIES.map((p) => (
                <span key={p.id} className="rounded-full border border-[#d9d1c2] px-3.5 py-1.5 text-[13px] text-[#3a332a]">
                  {p.name}
                </span>
              ))}
            </span>
            <span className="mt-1 text-xs uppercase tracking-[0.24em] text-[#9a7128]">Open →</span>
          </span>
        </button>
      </div>
    );
  }

  // 3. JD Stays & Hospitality: properties pop in one by one.
  if (stage === "stays") {
    return shell(
      <div className="mx-auto flex min-h-screen max-w-[1440px] flex-col items-center gap-11 px-5 pb-16 pt-8 sm:px-10 lg:px-16">
        <BackLink onClick={() => setStage("group")}>← JD Group</BackLink>
        <header className="jd-pop flex flex-col items-center gap-5 text-center">
          <div className="relative">
            <span className="jd-orbit gold" aria-hidden="true" />
            <span className="flex h-[150px] w-[150px] items-center justify-center rounded-full border border-[#d7aa60]/45 bg-[#17140f]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE}/brands/jd-lotus.webp`} alt="" className="w-[62%]" />
            </span>
          </div>
          <h1 className="jd-serif pl-[0.18em] text-[clamp(30px,3.6vw,48px)] font-semibold uppercase leading-tight tracking-[0.18em]">JD Stays &amp; Hospitality</h1>
          <Diamond />
          <Eyebrow className="pl-[0.34em]">Choose your property</Eyebrow>
        </header>
        <div className="flex max-w-[1180px] flex-wrap justify-center gap-x-9 gap-y-10">
          {STAYS_PROPERTIES.map((p, i) => (
            <BrandButton key={p.id} brand={p} size={180} delay={0.2 + 0.32 * i} onClick={() => choose(p)} />
          ))}
        </div>
      </div>
    );
  }

  // 4. Sign in under the chosen business's logo.
  return shell(
    <div className="flex min-h-screen flex-wrap">
      <div className="flex flex-[1_1_480px] flex-col items-center justify-center gap-4 border-[#e7e1d5] bg-white px-8 py-8 md:min-h-screen md:gap-6 md:py-14 text-center md:border-r">
        <span className="jd-pop">
          <LogoCircle brand={brand} size="clamp(150px, 26vw, 300px)" />
        </span>
        <span className="jd-serif text-[clamp(26px,3vw,34px)] font-semibold uppercase leading-tight tracking-[0.16em]">{brand.name}</span>
        <Eyebrow>{brand.tagline}</Eyebrow>
      </div>

      <div className="flex flex-[1_1_480px] items-center justify-center px-6 py-14">
        <form
          className="jd-rise flex w-full max-w-[400px] flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <BackLink onClick={() => setStage(isStaysProperty(brand) ? "stays" : "group")}>{isStaysProperty(brand) ? "← JD Stays properties" : "← All businesses"}</BackLink>
          <div className="flex flex-col gap-2">
            <Eyebrow>{tab === "signup" ? "New staff" : "Staff sign in"}</Eyebrow>
            <h1 className="jd-serif text-5xl font-medium leading-none">
              {tab === "signup" ? (
                <>
                  Join <em className="text-[#9a7128]">JD One</em>
                </>
              ) : (
                <>
                  Welcome <em className="text-[#9a7128]">back</em>
                </>
              )}
            </h1>
            <p className="font-light text-[#3a332a]">{mode === "local" ? "Local mode – single device." : tab === "signup" ? "Your account is activated once JD Group (HR) approves it." : "Use the login your manager gave you."}</p>
          </div>

          {mode === "local" ? (
            <>
              <DarkField label={pinSet ? "PIN" : "New PIN"}>
                <input type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} autoFocus className={cn(fieldInput, "text-center tracking-[0.5em]")} />
              </DarkField>
              {!pinSet && (
                <DarkField label="Repeat PIN">
                  <input type="password" inputMode="numeric" maxLength={4} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} className={cn(fieldInput, "text-center tracking-[0.5em]")} />
                </DarkField>
              )}
            </>
          ) : done ? (
            <div className="rounded-[4px] border border-[#d7aa60] px-4 py-4 text-sm text-[#3a332a]">{done}</div>
          ) : tab === "signin" ? (
            <>
              <DarkField label="Email">
                <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="name@myjdgroup.com" className={fieldInput} />
              </DarkField>
              <DarkField label="Password">
                <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={fieldInput} />
              </DarkField>
            </>
          ) : (
            <>
              <DarkField label="Full name">
                <input autoComplete="name" value={form.name} onChange={setF("name")} autoFocus className={fieldInput} />
              </DarkField>
              <DarkField label="Phone">
                <input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={setF("phone")} placeholder="98290 12345" className={fieldInput} />
              </DarkField>
              <DarkField label="Email">
                <input type="email" autoComplete="email" value={form.email} onChange={setF("email")} className={fieldInput} />
              </DarkField>
              <DarkField label="Password" help="At least 6 characters">
                <input type="password" autoComplete="new-password" value={form.password} onChange={setF("password")} className={fieldInput} />
              </DarkField>
              <DarkField label="Designation">
                <input value={form.designation} onChange={setF("designation")} placeholder="Front office, Chef, Housekeeping…" className={fieldInput} />
              </DarkField>
              <DarkField label="Business unit" help={unitsError ?? undefined}>
                <select value={form.business_unit_id} onChange={setF("business_unit_id")} className={fieldInput}>
                  <option value="">{units.length ? "Select…" : "Loading…"}</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                      {u.short_code ? ` (${u.short_code})` : ""}
                    </option>
                  ))}
                </select>
              </DarkField>
            </>
          )}

          {error && <p className="text-sm text-[#b4321f]">{error}</p>}
          {!done && (
            <button type="submit" disabled={busy} className="jd-gold-btn min-h-[54px] rounded-[4px] text-[13px] font-medium uppercase tracking-[0.26em] disabled:opacity-60">
              {busy ? "Please wait…" : mode === "local" ? (pinSet ? "Unlock" : "Set PIN & open") : tab === "signup" ? "Create account" : "Sign in"}
            </button>
          )}

          {mode === "supabase" && (
            <button
              type="button"
              onClick={() => {
                setTab(tab === "signin" ? "signup" : "signin");
                setError(null);
                setDone(null);
              }}
              className="min-h-11 self-center text-sm text-[#9a7128] hover:text-[#9a7128]"
            >
              {tab === "signin" ? "New staff? Create an account" : "Already have an account? Sign in"}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
