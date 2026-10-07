#!/usr/bin/env python3
"""Sync leads into JD One (Sales & Marketing → Leads & CRM).

  python3 scripts/sync_leads.py [--push] [--crm path/to/JD_Group_Sales_Marketing_CRM.xlsx]

Sources
- Udaisarovar Meta lead sheet (anyone-with-link): tabs "Campaign 1" (gid 0; clean rows + raw Meta rows) and
  "Campaign 1 (1)" (gid 105766656). Re-run any time: only NEW leads are added (keyed by Meta lead id / phone).
- Optional CRM workbook (Leads sheet: L-0001…): one-time import of the CRM history.

Rules
- One lead per phone number. Leads already in JD One are never overwritten (staff work in the app).
- New OPEN leads are shared round-robin between the callers (Danish, Gurpreet). Won leads become lifetime guests
  through the database trigger.
"""
import csv, io, json, os, re, sys, urllib.request, urllib.error
from datetime import datetime

SHEET = "1W11strgbf7oKj5zH39aSTsV7KoNX-epTjlyUDveMFj4"
TABS = ["0", "105766656"]
CALLERS = ["Danish", "Gurpreet Singh"]
PUSH = "--push" in sys.argv
CRM = sys.argv[sys.argv.index("--crm") + 1] if "--crm" in sys.argv else None

env = {}
for line in open(os.path.expanduser("~/jd-one/.env.local")):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1); env[k] = v.strip('"')
URL = env.get("SUPABASE_URL") or env["NEXT_PUBLIC_SUPABASE_URL"]; KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept-Profile": "jdone", "Content-Profile": "jdone", "Content-Type": "application/json"}

def api(method, path, body=None):
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", data=json.dumps(body).encode() if body is not None else None, headers={**H, "Prefer": "return=minimal"}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            t = r.read(); return json.loads(t) if t else None
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path}: {e.code} {e.read().decode()[:400]}")

def get_all(path):
    out, start = [], 0
    while True:
        req = urllib.request.Request(f"{URL}/rest/v1/{path}", headers={**H, "Range": f"{start}-{start + 999}"})
        rows = json.loads(urllib.request.urlopen(req, timeout=60).read()); out += rows
        if len(rows) < 1000: return out
        start += 1000

def ph(v): d = re.sub(r"\D", "", str(v or "")); return d[-10:] if len(d) >= 10 else None
def clean(v): v = str(v or "").strip(); return v or None
def nice(v): return clean(str(v or "").replace("_", " ").strip(" –-")) if v else None
def dt(v):
    if not v: return None
    if isinstance(v, datetime): return v.date().isoformat()
    s = str(v).strip()
    for f in ("%Y-%m-%d %H:%M", "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d %b %Y", "%d/%m/%y"):
        try: return datetime.strptime(s[:len(datetime.now().strftime(f))] if "%H" in f else s.split(" ")[0] if f != "%d %b %Y" else s, f).date().isoformat()
        except Exception: pass
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    return m.group(1) if m else None
def num(v):
    m = re.search(r"\d+", str(v or "")); return int(m.group()) if m else None

STAGE = {"new": "New", "not answered": "Contacted", "callback scheduled": "Contacted", "contacted": "Contacted", "discussed": "Qualified", "qualified": "Qualified",
         "quotation sent": "Proposal", "proposal / quote sent": "Proposal", "proposal": "Proposal", "hot – interested": "Negotiation", "hot - interested": "Negotiation",
         "negotiation": "Negotiation", "booked": "Won", "won": "Won", "lost / not interested": "Lost", "lost": "Lost", "on hold": "On Hold"}
def stage(v): return STAGE.get(str(v or "").strip().lower(), "New")

leads = []  # dicts in JD One shape + "_key" + "_assigned_name"
# ---------- Meta lead sheet
for gid in TABS:
    raw = urllib.request.urlopen(f"https://docs.google.com/spreadsheets/d/{SHEET}/export?format=csv&gid={gid}", timeout=60).read().decode("utf-8")
    rows = list(csv.reader(io.StringIO(raw)))
    if not rows or rows[0][:2] != ["Lead #", "Lead Received (IST)"]: continue
    h = rows[0]
    for r in rows[1:]:
        r = r + [""] * (len(h) - len(r)); x = dict(zip(h, r))
        if x["Lead #"].startswith("l:"):  # raw Meta export row (columns shifted)
            meta_id, name, phone, email = x["Lead #"], x.get("Name"), x.get("Phone Number "), x.get("Cottages Needed")
            req = " · ".join(filter(None, [nice(x.get("Lead Stage")), nice(x.get("Next Follow-up")), nice(x.get("Last Contacted")), nice(x.get("Visit / Check-in Dates")), nice(x.get("Call Attempts"))]))
            src = "Instagram" if x.get("Assigned To") == "ig" else "Meta Ads"
            leads.append({"_key": meta_id, "name": clean(name), "phone": ph(phone), "email": clean(email), "source": src, "campaign": clean(x.get("Guests")),
                          "requirement": req, "guests": num(x.get("Visit / Check-in Dates")), "stage": "New", "notes": clean(x.get("Staff Remarks")),
                          "created": dt(x.get("Lead Received (IST)")), "_assigned_name": None, "external_source": "Meta lead sheet", "_raw": 1})
        elif x.get("Guest Name"):
            req = " · ".join(filter(None, [x.get("Travelling With"), x.get("Occasion"), x.get("Package Interest"), (x.get("Guests") + " guests") if x.get("Guests") else None, x.get("Planning to Visit")]))
            notes = " · ".join(filter(None, [x.get("Staff Remarks"), ("Visit: " + x["Visit / Check-in Dates"]) if x.get("Visit / Check-in Dates") else None, ("Cottages: " + x["Cottages Needed"]) if x.get("Cottages Needed") else None]))
            leads.append({"_key": clean(x.get("Meta Lead ID")) or f"sheet:{x['Lead #']}", "name": clean(x["Guest Name"]), "phone": ph(x.get("Phone (+91)")), "email": clean(x.get("Email")),
                          "source": "Instagram" if (x.get("Platform") or "").lower().startswith("insta") else "Meta Ads", "campaign": " · ".join(filter(None, [x.get("Campaign"), x.get("Ad Name")])) or None,
                          "requirement": req or None, "guests": num(x.get("Guests")), "stage": stage(x.get("Lead Stage")), "call_attempts": num(x.get("Call Attempts")) or 0,
                          "last_contact": dt(x.get("Last Contacted")), "next_follow_up": dt(x.get("Next Follow-up")), "notes": notes or None, "created": dt(x.get("Lead Received (IST)")),
                          "qualification": "Hot" if "hot" in (x.get("Lead Stage") or "").lower() else None, "_assigned_name": clean(x.get("Assigned To")), "external_source": "Meta lead sheet"})

# ---------- CRM workbook (optional, one-time)
if CRM:
    import openpyxl
    ws = openpyxl.load_workbook(CRM, data_only=True)["Leads"]
    rows = list(ws.iter_rows(values_only=True)); hi = next(i for i, r in enumerate(rows) if r and r[0] == "Lead ID")
    h = [str(c).strip() if c else "" for c in rows[hi]]
    for r in rows[hi + 1:]:
        x = dict(zip(h, r))
        if not x.get("Lead ID") or not (x.get("Contact Name") or x.get("Phone / WhatsApp")) or "XXX" in str(x.get("Phone / WhatsApp") or "") or x.get("Assigned To") == "Sample Executive": continue
        src = str(x.get("Lead Source") or "")
        src = src if src in ("Meta Ads", "Google Ads", "Website", "Instagram", "WhatsApp", "Walk-in", "Referral", "Channel Partner", "OTA") else ("WhatsApp" if "whatsapp" in str(x.get("Notes / Remarks") or x.get("Campaign / Ad Name") or "").lower() else "Meta Ads")
        q = str(x.get("Qualification") or "").strip().capitalize() or None
        leads.append({"_key": "crm:" + str(x["Lead ID"]), "crm_id": str(x["Lead ID"]), "name": clean(x.get("Contact Name")) or f"Lead {x['Lead ID']}", "phone": ph(x.get("Phone / WhatsApp")),
                      "email": clean(x.get("Email")), "source": src, "campaign": clean(x.get("Campaign / Ad Name")), "requirement": clean(x.get("Requirement / Interest")),
                      "budget": x.get("Deal Value (₹)") or (x.get("Budget (₹)") if isinstance(x.get("Budget (₹)"), (int, float)) else None),
                      "stage": stage(x.get("Stage")), "qualification": q if q in ("Hot", "Warm", "Cold", "Unqualified") else None, "last_contact": dt(x.get("Last Contact Date")),
                      "next_follow_up": dt(x.get("Next Follow-up Date")), "lost_reason": clean(x.get("Lost Reason")),
                      "notes": " · ".join(filter(None, [clean(x.get("Notes / Remarks")), ("Budget: " + str(x["Budget (₹)"])) if x.get("Budget (₹)") and not isinstance(x.get("Budget (₹)"), (int, float)) else None, clean(x.get("City"))])) or None,
                      "created": dt(x.get("Date Added")), "_assigned_name": clean(x.get("Assigned To")), "external_source": "CRM workbook"})

# ---------- dedupe + push
existing = get_all("leads?select=id,phone,external_id")
have_phone = {ph(l["phone"]) for l in existing if ph(l.get("phone"))}
have_ext = {l["external_id"] for l in existing if l.get("external_id")}
staff = get_all("staff?select=id,name&active=eq.true")
sid = lambda n: next((s["id"] for s in staff if n and s["name"].lower().split()[0] == n.lower().split()[0]), None)
callers = [sid(n) for n in CALLERS if sid(n)]
uds = get_all("business_units?select=id&short_code=eq.UDS")[0]["id"]
out, seen, rr, skipped = [], set(), len(existing), 0
for l in sorted(leads, key=lambda l: (l["external_source"] != "Meta lead sheet", l.get("_raw", 0), l.get("created") or "")):  # sheet clean rows first, then raw Meta rows, then CRM
    p = l["phone"]; k = l["_key"]
    if (p and (p in have_phone or p in seen)) or k in have_ext or (not p and not l["name"]): skipped += 1; continue
    if p: seen.add(p)
    open_ = l["stage"] not in ("Won", "Lost")
    assignee = None
    if open_ and callers and l["external_source"] == "Meta lead sheet": assignee = callers[rr % len(callers)]; rr += 1
    elif open_ and callers and l["_assigned_name"] and not l["_assigned_name"].lower().startswith("sample"): assignee = callers[rr % len(callers)]; rr += 1
    prev = l.pop("_assigned_name"); l.pop("_key"); l.pop("_raw", None)
    created = l.pop("created", None)
    row = {**{k2: v for k2, v in l.items() if v not in (None, "")}, "business_unit_id": uds, "external_id": k, "assigned_to": assignee}
    if prev and prev.split()[0].lower() not in ("danish", "gurpreet"): row["notes"] = ((row.get("notes") or "") + f" · Earlier owner: {prev}").strip(" ·")
    if not row.get("phone"): row["phone"] = None
    if created: row["created_at"] = created + "T09:00:00+05:30"
    if row["stage"] == "New" and not row.get("next_follow_up") and assignee: row["next_follow_up"] = datetime.now().date().isoformat()
    out.append(row)
summary = {"read": len(leads), "new": len(out), "skipped_existing_or_duplicate": skipped, "by_source": {}, "by_stage": {}, "assigned": sum(1 for r in out if r.get("assigned_to"))}
for r in out:
    summary["by_source"][r["external_source"]] = summary["by_source"].get(r["external_source"], 0) + 1
    summary["by_stage"][r["stage"]] = summary["by_stage"].get(r["stage"], 0) + 1
if PUSH and out:
    keys = sorted({k for r in out for k in r})
    now = datetime.now().astimezone().isoformat()
    defaults = {"call_attempts": 0, "created_at": now, "stage": "New", "source": "Other"}
    norm = [{k: (r.get(k) if r.get(k) is not None else defaults.get(k)) for k in keys} for r in out]
    for i in range(0, len(norm), 200): api("POST", "leads", norm[i:i + 200])
print(json.dumps(summary, indent=1), "PUSHED" if PUSH else "(dry run — add --push)")
