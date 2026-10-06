#!/usr/bin/env python3
"""Import WhatsApp-extracted history (expenses, salaries paid, vendors, enquiries, reservations) into JD One.
Usage: python3 scripts/history_import.py <wa_extract_dir> [--push] [--only expenses,salaries,vendors,leads,bookings]
Idempotent: every row carries a stable source_ref / external_id, and expenses also skip existing (date, amount) pairs."""
import hashlib, json, os, re, sys, urllib.request, urllib.parse, uuid

d = sys.argv[1]; PUSH = "--push" in sys.argv
ONLY = set(sys.argv[sys.argv.index("--only") + 1].split(",")) if "--only" in sys.argv else {"expenses", "salaries", "vendors", "leads", "bookings"}
env = {}
for line in open(os.path.expanduser("~/jd-one/.env.local")):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1); env[k] = v.strip('"')
URL = env.get("SUPABASE_URL") or env["NEXT_PUBLIC_SUPABASE_URL"]; KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept-Profile": "jdone", "Content-Profile": "jdone", "Content-Type": "application/json"}

def api(method, path, body=None, prefer=None):
    h = dict(H)
    if prefer: h["Prefer"] = prefer
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", data=json.dumps(body).encode() if body is not None else None, headers=h, method=method)
    with urllib.request.urlopen(req, timeout=60) as r:
        t = r.read(); return json.loads(t) if t else None

def get_all(path):
    return api("GET", path + ("&" if "?" in path else "?") + "limit=10000")

def ref(*parts): return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()[:16]
def load(n): return json.load(open(os.path.join(d, n + ".json")))
def digits(p): return re.sub(r"\D", "", p or "")[-10:] or None

UDS = get_all("business_units?select=id&short_code=eq.UDS")[0]["id"]
staff = get_all("staff?select=id,name")
def staff_id(name):
    first = re.split(r"[\s(]", (name or "").strip())[0].lower()
    hits = [s for s in staff if s["name"].lower().split()[0] == first]
    return hits[0]["id"] if len(hits) == 1 else None

report = {}
def push(table, rows, conflict):
    have = {r[conflict] for r in get_all(f"{table}?select={conflict}") if r.get(conflict)}
    rows = [r for r in rows if r[conflict] not in have]
    report[table] = len(rows)
    if PUSH and rows:
        for i in range(0, len(rows), 200):
            api("POST", table, rows[i:i+200], prefer="return=minimal")

# ---- expenses
if "expenses" in ONLY:
    have = {(e["date"], float(e["amount"])) for e in get_all("expenses?select=date,amount")}
    rows, skipped = [], 0
    for e in load("expenses"):
        if (e["date"], float(e["amount"])) in have: skipped += 1; continue
        detail = e.get("detail") or ""
        if e.get("confidence") == "low": detail = "[check] " + detail
        rows.append({"date": e["date"], "business_unit_id": UDS, "amount": e["amount"], "category": e["category"], "vendor": e.get("vendor") or "Unlabelled",
                     "detail": f"{detail} — from WhatsApp: {e.get('source','')}".strip(), "mode": e.get("mode") or None,
                     "source_ref": "wa:" + ref(e["date"], e["amount"], e.get("source"), e.get("detail"))})
    report["expenses_skipped_existing"] = skipped
    push("expenses", rows, "source_ref")

# ---- salaries paid
if "salaries" in ONLY:
    rows = []
    for s in load("salaries"):
        rows.append({"staff_name": s["staff_name"], "staff_id": staff_id(s["staff_name"]), "salary_month": s.get("salary_month"), "date": s["date"],
                     "amount": s["amount"], "kind": {"advance": "Advance", "incentive": "Incentive", "bonus": "Bonus"}.get(s.get("kind"), "Salary"),
                     "mode": s.get("mode"), "notes": ("[check] " if s.get("confidence") == "low" else "") + "From WhatsApp: " + s.get("source", ""),
                     "source_ref": "wa:" + ref(s["date"], s["amount"], s["staff_name"], s.get("source"))})
    push("salary_payments", rows, "source_ref")

# ---- vendors
if "vendors" in ONLY:
    rows = []
    for v in load("vendors"):
        if v["name"].lower().startswith("unlabelled"): continue
        rows.append({"name": v["name"], "phone": digits(v.get("phone")), "category": v.get("category") or "Other",
                     "supplies": "; ".join(dict.fromkeys(v.get("items") or []))[:1000] or None, "payments_count": v.get("payments_count"),
                     "total_paid": v.get("total_paid"), "first_paid": v.get("first_paid"), "last_paid": v.get("last_paid"), "notes": "Built from WhatsApp payment history"})
    push("vendors", rows, "name")

# ---- enquiries → leads
if "leads" in ONLY:
    custs = {digits(c["phone"]): c["id"] for c in get_all("customers?select=id,phone") if digits(c["phone"])}
    rows = []
    for q in load("inquiries"):
        ph = digits(q.get("phone"))
        m = re.search(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})", q.get("wanted_dates") or "")
        vf = None
        if m:
            dd, mm, yy = m.groups(); yy = ("20" + yy) if len(yy) == 2 else yy
            vf = f"{yy}-{int(mm):02d}-{int(dd):02d}"
        g = re.search(r"(\d+)\s*(adult|pax|people|guest)", q.get("pax") or "", re.I)
        b = re.search(r"₹\s?([\d,]+)", q.get("message_summary") or "")
        stage = {"booked": "Won", "quoted": "Proposal"}.get(q.get("outcome_hint"), "Contacted")
        rows.append({"name": (q.get("name") or "WhatsApp enquiry").strip().title(), "phone": ph, "customer_id": custs.get(ph), "business_unit_id": UDS,
                     "source": "WhatsApp", "requirement": q.get("message_summary"), "visit_from": vf, "guests": int(g.group(1)) if g else None,
                     "budget": int(b.group(1).replace(",", "")) if b else None, "stage": stage, "last_contact": q["date"],
                     "notes": f"Wanted: {q.get('wanted_dates') or '-'} · Pax: {q.get('pax') or '-'}", "external_source": "WhatsApp: " + q.get("source", ""),
                     "external_id": "wa-inq:" + ref(q["date"], ph or q.get("name"), q.get("message_summary"))})
    push("leads", rows, "external_id")

# ---- reservations → bookings (after AsiaTech import; skips anything AsiaTech already has)
if "bookings" in ONLY:
    from datetime import date as _d, timedelta
    have = get_all("bookings?select=id,external_ref,check_in,check_out,guest_name,phone,total,status")
    refs = {b["external_ref"] for b in have if b.get("external_ref")}
    custs = {digits(c["phone"]): c["id"] for c in get_all("customers?select=id,phone") if digits(c["phone"])}
    def first(n): return (re.split(r"\s+", (n or "").strip().lower()) or [""])[0]
    def same(b, r):
        if b["check_in"] != r["check_in"]: return False
        if digits(b.get("phone")) and digits(r.get("phone")) and digits(b["phone"]) == digits(r["phone"]): return True
        if r.get("guest_name") and first(b["guest_name"]) == first(r["guest_name"]): return True
        return r.get("total") and abs(float(b.get("total") or 0) - float(r["total"])) < 1
    def unit(u):
        t = (u or "").lower()
        if "pool" in t: return "Pool View Cottage"
        if "suite" in t or "family" in t: return "Family Suite"
        if "camp" in t or "tent" in t: return "Camping"
        if "villa" in t: return "Other"
        return "Lake View Cottage"
    def units(u):
        m = re.search(r"\((\d+)\)|x\s*(\d+)|^(\d+)\s", u or "")
        return int(next(g for g in m.groups() if g)) if m else (5 if "villa" in (u or "").lower() else 1)
    def status(notes):
        t = (notes or "").lower()
        if "cancel" in t: return "Cancelled"
        if "checked out" in t: return "Checked-out"
        if "checked in" in t: return "Checked-in"
        return "Confirmed"
    CH = {"MakeMyTrip": "MMT/Goibibo", "Goibibo": "MMT/Goibibo", "Airbnb": "Airbnb", "Agoda": "Agoda", "Booking.com": "Booking.com"}
    rows, dup = [], 0
    for r in load("reservations"):
        if not r.get("check_in"): continue
        if r.get("ota_booking_id") and r["ota_booking_id"] in refs: dup += 1; continue
        if any(same(b, r) for b in have): dup += 1; continue
        co = r.get("check_out") or (_d.fromisoformat(r["check_in"]) + timedelta(days=1)).isoformat()
        ph = digits(r.get("phone"))
        total = float(r.get("total") or 0); adv = float(r.get("advance") or 0)
        rows.append({"external_ref": r.get("ota_booking_id") or "WA-" + ref(r["check_in"], r.get("guest_name"), r.get("total"), r.get("source")),
                     "guest_name": (r.get("guest_name") or "Guest (name not in chat)").strip().title(), "phone": ph or "", "customer_id": custs.get(ph),
                     "business_unit_id": UDS, "check_in": r["check_in"], "check_out": co, "unit_type": unit(r.get("units")), "units": units(r.get("units")),
                     "adults": int(re.search(r"\d+", str(r["pax"])).group()) if r.get("pax") and re.search(r"\d+", str(r["pax"])) else None,
                     "meal_plan": "CP" if "breakfast" in (r.get("units") or "").lower() or "CP" in (r.get("notes") or "") else "EP",
                     "total": total, "paid": adv or None, "balance": max(0, total - adv) if total else None,
                     "source": CH.get(r.get("channel"), "Direct"), "status": status(r.get("notes")), "import_source": "WhatsApp: " + (r.get("source") or ""),
                     "special_requests": r.get("notes") or None, "created_at": (r.get("booked_on") or r["check_in"]) + "T09:00:00+05:30"})
    report["bookings_already_in_app"] = dup
    push("bookings", rows, "external_ref")

print(json.dumps(report, indent=1), "PUSHED" if PUSH else "(dry run — add --push)")
