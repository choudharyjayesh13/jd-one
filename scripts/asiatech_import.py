#!/usr/bin/env python3
"""AsiaTech booking exports (.xls, 40-day windows) → JD One customers + bookings + Excel.

  python3 scripts/asiatech_import.py <dir-with-xls> --excel ~/Desktop/JD-Customers.xlsx [--push]

- Merges all .xls files (dedupes by Booking ID).
- Customers: one per mobile number (fallback: name+email); customer number JDG00001…
  in order of first booking; keeps name (best-cased), phone, email, first/last visit,
  stays, spend, who created the first booking.
- Bookings: check-in/out, nights, room, guests, meal plan, amount/received/pending,
  status, source, and "Booked by" (the AsiaTech user or channel that created it).
- --push upserts into Supabase (jdone.customers / jdone.bookings) with the service key
  from ~/jd-one/.env.local; bookings keyed by external_ref = AsiaTech Booking ID.
"""
import glob, json, os, re, sys, urllib.request, uuid, hashlib
from datetime import datetime, date
import xlrd, openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

src = sys.argv[1]
excel_out = sys.argv[sys.argv.index("--excel") + 1] if "--excel" in sys.argv else os.path.expanduser("~/Desktop/JD-Customers.xlsx")
push = "--push" in sys.argv

COLS = {}
rows = {}
for f in sorted(glob.glob(os.path.join(src, "*.xls"))):
    sh = xlrd.open_workbook(f, ignore_workbook_corruption=True).sheet_by_index(0)
    if sh.nrows < 2:
        continue
    hdr = [str(c.value).strip() for c in sh.row(0)]
    COLS = {h: i for i, h in enumerate(hdr)}
    # "Account Booking Export" layout: Booking ID, Name, Booking Date, Check In, Check Out, Channel, Commission, Tax, Total, Type, Received, Room Assigned, Invoice No
    slim = "Channel" in COLS and "Mobile" not in COLS
    for r in range(1, sh.nrows):
        rec = {h: sh.cell(r, i).value for h, i in COLS.items()}
        bid = str(rec.get("Booking ID", "")).strip()
        if not bid:
            continue
        if slim:
            rec = {"Booking ID": bid, "Name": rec.get("Name"), "Booking Date": rec.get("Booking Date"), "Check In": rec.get("Check In"), "Check Out": rec.get("Check Out"),
                   "Source": rec.get("Channel"), "Source Type": "", "Booking By": rec.get("Channel"), "Total Amount": rec.get("Total"), "Received Amount": rec.get("Received"),
                   "Pending Amount": (float(rec.get("Total") or 0) - float(rec.get("Received") or 0)), "Status": "Confirmed", "Payment Status": rec.get("Type"), "Room Assigned": rec.get("Room Assigned"),
                   "Room Type": "Lake View Cottage", "No. Rooms": 1, "No. Adults": 2, "No. Childs": 0, "Mealplan": "EP", "Mobile": "", "Email": "", "Special Comment": "",
                   "No. Nights": max(1, int((__import__("datetime").date.fromisoformat(str(rec.get("Check Out"))[:10]) - __import__("datetime").date.fromisoformat(str(rec.get("Check In"))[:10])).days)) if rec.get("Check In") and rec.get("Check Out") else 1}
        if bid not in rows or not slim:   # full-layout rows win over slim ones
            rows[bid] = rec
print(f"bookings read: {len(rows)} from {len(glob.glob(os.path.join(src, '*.xls')))} files")

def s(v):
    if v is None: return ""
    if isinstance(v, float) and v.is_integer(): return str(int(v))
    return str(v).strip()
def num(v):
    try: return float(v) if s(v) not in ("", "-", "N/A") else 0.0
    except: return 0.0
def phone(v):
    d = re.sub(r"\D", "", s(v)); return d[-10:] if len(d) >= 10 else d
def d10(v):
    t = s(v)[:10]; return t if re.match(r"\d{4}-\d{2}-\d{2}", t) else None
def title(n):
    n = re.sub(r"\s+", " ", s(n)).strip()
    return " ".join(w.capitalize() if w.isupper() or w.islower() else w for w in n.split(" ")) or "Guest"
def booked_by(rec):
    by = s(rec.get("Booking By")); src_ = s(rec.get("Source")); st = s(rec.get("Source Type"))
    by = re.sub(r"\s*\(.*?\)", "", by).strip().title() if by else ""
    return by or src_ or st or "Unknown"
def source_map(rec):
    src_ = (s(rec.get("Source")) + " " + s(rec.get("Source Type"))).lower()
    for k, v in [("makemytrip", "MMT/Goibibo"), ("goibibo", "MMT/Goibibo"), ("booking.com", "Booking.com"), ("agoda", "Agoda"), ("expedia", "Expedia"), ("airbnb", "Airbnb"), ("walk", "Walk-in"), ("corporate", "Corporate")]:
        if k in src_: return v
    return "Direct"
def unit_map(rec):
    t = s(rec.get("Room Type")).lower()
    if "pool" in t: return "Pool View Cottage"
    if "family" in t or "suite" in t: return "Family Suite"
    if "camp" in t: return "Camping"
    if "glass" in t: return "Glass House"
    if "cottage" in t or "lake" in t: return "Lake View Cottage"
    return "Other"
def status_map(rec):
    st = s(rec.get("Status")).lower()
    if "cancel" in st: return "Cancelled"
    if "no show" in st or "noshow" in st: return "No-show"
    if "check" in st and "out" in st: return "Checked-out"
    if "check" in st and "in" in st: return "Checked-in"
    return "Confirmed"

# ---- customers
customers = {}   # key -> dict
order = sorted(rows.values(), key=lambda r: (d10(r.get("Booking Date")) or "9999", s(r.get("Booking ID"))))
for rec in order:
    ph = phone(rec.get("Mobile")); em = s(rec.get("Email")); em = "" if em.upper() in ("N/A", "-") else em.lower()
    key = ph or (title(rec.get("Name")).lower() + "|" + em)
    c = customers.setdefault(key, {"name": title(rec.get("Name")), "phone": ph, "email": em, "first_seen": d10(rec.get("Booking Date")), "created_by": booked_by(rec), "stays": 0, "spend": 0.0, "nights": 0, "first_visit": None, "last_visit": None, "bookings": []})
    if not c["email"] and em: c["email"] = em
    if len(title(rec.get("Name"))) > len(c["name"]): c["name"] = title(rec.get("Name"))
    c["bookings"].append(rec)
# Customer numbers are permanent: reuse numbers already in JD One (matched by phone), then continue after the highest.
existing_no = {}
placeholder_by_name = {}
try:
    envx = {}
    for line in open(os.path.expanduser("~/jd-one/.env.local")):
        if "=" in line and not line.startswith("#"): k_, v_ = line.strip().split("=", 1); envx[k_] = v_
    got = json.loads(urllib.request.urlopen(urllib.request.Request(f"{envx['SUPABASE_URL']}/rest/v1/customers?select=phone,customer_no&customer_no=not.is.null&limit=5000", headers={"apikey": envx["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": f"Bearer {envx['SUPABASE_SERVICE_ROLE_KEY']}", "Accept-Profile": envx.get("SUPABASE_SCHEMA", "public")}), timeout=30).read())
    existing_no = {g["phone"]: g["customer_no"] for g in got if g.get("customer_no")}
    # Guests with no phone are stored with their JDG number as a placeholder phone: match them by name (lowest number wins).
    got_n = json.loads(urllib.request.urlopen(urllib.request.Request(f"{envx['SUPABASE_URL']}/rest/v1/customers?select=name,phone,customer_no&phone=like.JDG*&order=customer_no.asc&limit=5000", headers={"apikey": envx["SUPABASE_SERVICE_ROLE_KEY"], "Authorization": f"Bearer {envx['SUPABASE_SERVICE_ROLE_KEY']}", "Accept-Profile": envx.get("SUPABASE_SCHEMA", "public")}), timeout=30).read())
    for g in got_n: placeholder_by_name.setdefault(g["name"].strip().lower(), (g["phone"], g["customer_no"]))
except Exception as e:
    print("note: could not read existing customer numbers:", e)
next_no = max([int(v[3:]) for v in existing_no.values() if re.match(r"JDG\d+$", v)] or [0]) + 1
for k, c in sorted(customers.items(), key=lambda kv: (kv[1]["first_seen"] or "9999", kv[1]["name"])):
    ph_key = c["phone"] or None
    known = existing_no.get(ph_key) if ph_key else None
    if not ph_key and c["name"].strip().lower() in placeholder_by_name:
        c["phone_placeholder"], known = placeholder_by_name.pop(c["name"].strip().lower())
    if known:
        c["customer_no"] = known
    else:
        c["customer_no"] = f"JDG{next_no:05d}"; next_no += 1
    c["id"] = str(uuid.uuid5(uuid.NAMESPACE_URL, "jdone-customer-" + (c["phone"] or k)))
    if not c["phone"] and not c.get("phone_placeholder"):
        c["phone_placeholder"] = existing_no and next((p for p, n in existing_no.items() if n == c["customer_no"]), None) or c["customer_no"]
    for rec in c["bookings"]:
        if status_map(rec) in ("Confirmed", "Checked-in", "Checked-out"):
            c["stays"] += 1; c["nights"] += int(num(rec.get("No. Nights"))); c["spend"] += num(rec.get("Received Amount"))
            ci = d10(rec.get("Check In"))
            if ci: c["first_visit"] = min(c["first_visit"] or ci, ci); c["last_visit"] = max(c["last_visit"] or ci, ci)

# ---- bookings
bookings = []
for rec in order:
    ph = phone(rec.get("Mobile")); em = s(rec.get("Email")).lower(); em = "" if em in ("n/a", "-") else em
    key = ph or (title(rec.get("Name")).lower() + "|" + em)
    c = customers[key]
    total = num(rec.get("Total Amount")) or num(rec.get("Booking Amount"))
    b = {
        "id": str(uuid.uuid5(uuid.NAMESPACE_URL, "jdone-booking-" + s(rec.get("Booking ID")))),
        "external_ref": s(rec.get("Booking ID")), "customer_no": c["customer_no"], "customer_id": c["id"],
        "guest_name": c["name"], "phone": ph or None, "booking_date": d10(rec.get("Booking Date")),
        "check_in": d10(rec.get("Check In")), "check_out": d10(rec.get("Check Out")), "nights": int(num(rec.get("No. Nights"))),
        "unit_type": unit_map(rec), "room_type_raw": s(rec.get("Room Type")), "units": int(num(rec.get("No. Rooms")) or 1),
        "adults": int(num(rec.get("No. Adults"))), "children": int(num(rec.get("No. Childs"))), "meal_plan": (s(rec.get("Mealplan")) or "EP").upper()[:3],
        "total": round(total, 2), "paid": round(num(rec.get("Received Amount")), 2), "balance": round(num(rec.get("Pending Amount")), 2),
        "source": source_map(rec), "booked_by": booked_by(rec), "status": status_map(rec), "payment_status": s(rec.get("Payment Status")),
        "room_assigned": s(rec.get("Room Assigned")), "comment": s(rec.get("Special Comment")),
    }
    bookings.append(b)

# ---- Excel
wb = openpyxl.Workbook()
hdr_fill = PatternFill("solid", fgColor="0B1F3A"); hdr_font = Font(bold=True, color="FFFFFF")
def sheet(ws, headers, data, widths):
    ws.append(headers)
    for c in ws[1]: c.fill = hdr_fill; c.font = hdr_font; c.alignment = Alignment(vertical="center")
    for r in data: ws.append(r)
    for i, w in enumerate(widths, start=1): ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"; ws.auto_filter.ref = ws.dimensions
ws = wb.active; ws.title = "Customers"
cl = sorted(customers.values(), key=lambda c: c["customer_no"])
sheet(ws, ["Customer No", "Name", "Mobile", "Email", "First booking", "First visit", "Last visit", "Stays", "Nights", "Total paid (₹)", "Bookings", "First booking created by"],
      [[c["customer_no"], c["name"], c["phone"], c["email"], c["first_seen"], c["first_visit"], c["last_visit"], c["stays"], c["nights"], round(c["spend"]), len(c["bookings"]), c["created_by"]] for c in cl],
      [13, 26, 14, 30, 13, 12, 12, 7, 7, 14, 9, 22])
ws2 = wb.create_sheet("Bookings")
sheet(ws2, ["Customer No", "Guest", "Mobile", "Booking ID", "Booked on", "Check-in", "Check-out", "Nights", "Room", "Rooms", "Adults", "Kids", "Meal", "Total (₹)", "Paid (₹)", "Pending (₹)", "Status", "Payment", "Source", "Created by", "Room assigned", "Comment"],
      [[b["customer_no"], b["guest_name"], b["phone"], b["external_ref"], b["booking_date"], b["check_in"], b["check_out"], b["nights"], b["room_type_raw"], b["units"], b["adults"], b["children"], b["meal_plan"], b["total"], b["paid"], b["balance"], b["status"], b["payment_status"], b["source"], b["booked_by"], b["room_assigned"], b["comment"]] for b in sorted(bookings, key=lambda b: b["booking_date"] or "", reverse=True)],
      [13, 24, 13, 20, 12, 12, 12, 7, 32, 7, 7, 6, 6, 11, 11, 11, 12, 13, 13, 18, 14, 30])
ws3 = wb.create_sheet("Summary")
by = {}
for b in bookings: by[b["booked_by"]] = by.get(b["booked_by"], 0) + 1
ws3.append(["Generated", datetime.now().strftime("%d %b %Y %H:%M")]); ws3.append(["Source", "AsiaTech channel manager booking export"])
ws3.append([]); ws3.append(["Customers", len(cl)]); ws3.append(["Bookings", len(bookings)]); ws3.append(["Cancelled", sum(1 for b in bookings if b["status"] == "Cancelled")])
ws3.append(["Total received (₹)", round(sum(b["paid"] for b in bookings))]); ws3.append([]); ws3.append(["Created by", "Bookings"])
for k, v in sorted(by.items(), key=lambda kv: -kv[1]): ws3.append([k, v])
ws3.column_dimensions["A"].width = 22; ws3.column_dimensions["B"].width = 40
wb.save(excel_out); print("Excel →", excel_out, "|", len(cl), "customers,", len(bookings), "bookings")

# ---- push to Supabase
if push:
    env = {}
    for line in open(os.path.expanduser("~/jd-one/.env.local")):
        if "=" in line and not line.startswith("#"): k, v = line.strip().split("=", 1); env[k] = v
    url, key, schema = env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"], env.get("SUPABASE_SCHEMA", "public")
    def rest(table, payload, on_conflict):
        req = urllib.request.Request(f"{url}/rest/v1/{table}?on_conflict={on_conflict}", data=json.dumps(payload).encode(), method="POST",
              headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Content-Profile": schema, "Prefer": "resolution=merge-duplicates,return=minimal"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r: return r.status
        except urllib.error.HTTPError as e:
            print("REST error", table, e.code, e.read().decode()[:300]); raise
    uds = json.loads(urllib.request.urlopen(urllib.request.Request(f"{url}/rest/v1/business_units?select=id&short_code=eq.UDS", headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept-Profile": schema})).read())[0]["id"]
    cust_rows = [{"customer_no": c["customer_no"], "name": c["name"], "phone": c["phone"] or c.get("phone_placeholder") or c["customer_no"], "email": c["email"] or None, "first_source": "AsiaTech", "first_seen": c["first_seen"], "notes": f"Imported from AsiaTech {date.today()}; first booking created by {c['created_by']}"} for c in cl]
    for i in range(0, len(cust_rows), 200): rest("customers", cust_rows[i:i+200], "phone")
    # Re-read ids by phone: an existing customer with the same phone keeps its own id.
    got = json.loads(urllib.request.urlopen(urllib.request.Request(f"{url}/rest/v1/customers?select=id,phone,customer_no&limit=5000", headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept-Profile": schema})).read())
    id_by_phone = {g["phone"]: g["id"] for g in got}
    for c in cl:
        c["id"] = id_by_phone.get(c["phone"] or c.get("phone_placeholder") or c["customer_no"], c["id"])
    for b in bookings:
        b["customer_id"] = next((c["id"] for c in cl if c["customer_no"] == b["customer_no"]), b["customer_id"])
    book_rows = [{"id": b["id"], "external_ref": b["external_ref"], "customer_id": b["customer_id"], "guest_name": b["guest_name"], "phone": b["phone"] or "", "business_unit_id": uds,
                  "check_in": b["check_in"], "check_out": b["check_out"], "unit_type": b["unit_type"], "units": b["units"], "adults": b["adults"], "children": b["children"], "meal_plan": b["meal_plan"] if b["meal_plan"] in ("EP","CP","MAP","AP") else "EP",
                  "total": b["total"], "paid": b["paid"], "balance": b["balance"], "source": b["source"], "booked_by": b["booked_by"], "status": b["status"],
                  "special_requests": (b["comment"] or None), "created_at": (b["booking_date"] or date.today().isoformat()) + "T09:00:00+05:30"} for b in bookings if b["check_in"] and b["check_out"]]
    for i in range(0, len(book_rows), 200): rest("bookings", book_rows[i:i+200], "id")
    print("pushed", len(cust_rows), "customers and", len(book_rows), "bookings to Supabase")
