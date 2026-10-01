import { Building2 } from "lucide-react";
import { ADMIN_ROLES, defineEntity } from "@/core/schema/types";

/** Seeded on first run; every other record points at one of these. */
export const BUSINESS_UNIT_SEED = [
  { name: "The Udaisarovar", short_code: "UDS", type: "Resort", city: "Udaipur" },
  { name: "Pronite", short_code: "PRN", type: "Events", city: "Udaipur" },
  { name: "CPC – Choudhary Properties & Consultancy", short_code: "CPC", type: "Consultancy", city: "Udaipur" },
  { name: "JD Group HQ", short_code: "HQ", type: "HQ", city: "Udaipur" },
  { name: "The Belmonte House", short_code: "TBH", type: "Hotel", city: "Udaipur" },
  { name: "Stepwhere", short_code: "STW", type: "Shop / retail", city: "Udaipur" },
  { name: "Aloe E-Cell", short_code: "AEC", type: "Manufacturing", city: "Udaipur" },
  { name: "Hotel Kirti Plaza", short_code: "HKP", type: "Hotel", city: "Chittorgarh" },
  { name: "BPCL Petrol Pump", short_code: "BPCL", type: "Fuel station", city: "Chittorgarh" },
  { name: "BPCL Petrol Pump – Badi Sadi", short_code: "BPBS", type: "Fuel station", city: "Badi Sadi" },
  { name: "The Artist House", short_code: "TAH", type: "Hotel", city: "Udaipur" },
  { name: "House of Beauty", short_code: "HOB", type: "Salon", city: "Udaipur" },
];

export const BUSINESS_TYPES = ["Hotel", "Resort", "Fuel station", "Restaurant", "Shop / retail", "Events", "Consultancy", "Transport", "Salon", "Clinic", "Education", "Manufacturing", "Farm", "HQ", "Other"] as const;

export const INDIAN_STATES = ["Rajasthan", "Gujarat", "Madhya Pradesh", "Maharashtra", "Delhi", "Haryana", "Punjab", "Uttar Pradesh", "Uttarakhand", "Himachal Pradesh", "Jammu & Kashmir", "Bihar", "Jharkhand", "West Bengal", "Odisha", "Chhattisgarh", "Telangana", "Andhra Pradesh", "Karnataka", "Tamil Nadu", "Kerala", "Goa", "Assam", "Other"] as const;
/** Network rule (Jayesh, 1 Oct 2026): at most this many member businesses per city. */
export const CITY_MEMBER_CAP = 300;

export const ERP_SYSTEMS = ["None", "Own website", "Shopify", "WooCommerce", "Zoho", "Tally", "Vyapar", "Custom webhook", "WhatsApp only"] as const;

export const HOTEL_AMENITIES = ["Swimming pool", "Lake view", "Garden", "Bonfire", "Restaurant", "Room service", "Free Wi-Fi", "Free parking", "Air conditioning", "Power backup", "Indoor games", "Pet-friendly", "Wedding lawn", "Banquet", "Camping", "Boating", "Spa", "Gym", "Bar"] as const;

export const businessUnits = defineEntity({
  name: "business-units",
  label: "Business units",
  labelSingular: "Business unit",
  icon: Building2,
  table: "business_units",
  teams: ["marketing"],
  titleField: "name",
  searchFields: ["name", "short_code", "city"],
  defaultSort: { field: "name", dir: "asc" },
  permissions: { create: ADMIN_ROLES, update: ADMIN_ROLES, delete: ["owner"] },
  fields: [
    { name: "name", label: "Name", type: "text", required: true },
    { name: "owner_id", label: "Owner", type: "relation", entity: "owners", help: "The network member who owns this business" },
    { name: "short_code", label: "Short code", type: "text", placeholder: "UDS" },
    { name: "type", label: "Type", type: "select", options: BUSINESS_TYPES },
    { name: "state", label: "State", type: "select", options: INDIAN_STATES, default: "Rajasthan", help: "Main network division: State → District → City" },
    { name: "district", label: "District", type: "text", default: "Udaipur" },
    { name: "city", label: "City", type: "text", default: "Udaipur", help: "Max 300 network members per city" },
    { name: "service_category", label: "Main service / product", type: "text", placeholder: "Stay, Fuel, Salon, Footwear…", help: "What this member covers for the city's network" },
    { name: "manager_name", label: "Manager name", type: "text" },
    { name: "manager_phone", label: "Manager mobile", type: "phone", help: "Members call this number directly from the Network page" },
    { name: "google_maps_url", label: "Google Maps / reviews link", type: "text", placeholder: "https://maps.app.goo.gl/…" },
    { name: "google_rating", label: "Google rating", type: "number", min: 0, max: 5, step: 0.1 },
    { name: "google_reviews_count", label: "Google reviews", type: "number", min: 0 },
    { name: "phone", label: "Phone", type: "phone" },
    { name: "email", label: "Email", type: "email" },
    { name: "website", label: "Website", type: "text", placeholder: "https://…" },
    { name: "active", label: "Active", type: "boolean", default: true, help: "Shown in filters and forms" },
    { name: "address", label: "Address", type: "textarea" },
    { name: "description", label: "Property description", type: "textarea", wide: true, help: "As shown to guests (OTA listing text)" },
    { name: "star_category", label: "Category", type: "select", options: ["Homestay", "Resort", "3 star", "4 star", "5 star", "Boutique", "Other"] },
    { name: "checkin_time", label: "Check-in time", type: "text", placeholder: "14:00", default: "14:00" },
    { name: "checkout_time", label: "Check-out time", type: "text", placeholder: "11:00", default: "11:00" },
    { name: "gstin", label: "GSTIN", type: "text" },
    { name: "gst_rate", label: "GST on rooms (%)", type: "number", min: 0, max: 28, default: 12, help: "Used on rate sheets and payment requests" },
    { name: "upi_id", label: "UPI ID for payments", type: "text", placeholder: "name@bank", help: "Request money generates a UPI link to this ID" },
    { name: "network_customer_discount_pct", label: "Network discount: customers %", type: "number", min: 0, max: 100, default: 10, help: "Off for any JD One customer who deals with you directly" },
    { name: "network_owner_discount_pct", label: "Network discount: owners %", type: "number", min: 0, max: 100, default: 15, help: "Off for other network owners and their businesses" },
    { name: "network_offer", label: "What you offer the network", type: "textarea", help: "Shown on the Network page: products, services, who to contact" },
    // Integrations: where an order from the network should land (the member's own website / ERP / order system).
    { name: "erp_name", label: "Order system", type: "select", options: ERP_SYSTEMS, default: "None", help: "Where your orders live today; JD One sends network orders there" },
    { name: "order_page_url", label: "Order page link", type: "text", placeholder: "https://stepwhere.in/order?name={name}&phone={phone}&items={items}", help: "Opened for the customer with {name} {phone} {items} {amount} {order_no} filled in" },
    { name: "order_webhook_url", label: "Order webhook (ERP) URL", type: "text", placeholder: "https://erp.example.com/jdone/orders", help: "JD One POSTs each network order here as JSON the moment it is placed" },
    { name: "order_webhook_secret", label: "Webhook secret", type: "text", help: "Sent as the X-JDOne-Secret header so your system can trust the call" },
    { name: "order_email", label: "Order email", type: "email", help: "Copy of each network order (if set)" },
    { name: "amenities", label: "Amenities", type: "multiselect", options: HOTEL_AMENITIES, wide: true },
    { name: "policies", label: "Policies", type: "textarea", wide: true, help: "Cancellation, ID proof, couples, pets, smoking…" },
    { name: "maps_url", label: "Google Maps link", type: "text" },
    { name: "latitude", label: "Latitude", type: "number", step: 0.000001, help: "For attendance distance checks (Google Maps → right-click → copy coordinates)" },
    { name: "longitude", label: "Longitude", type: "number", step: 0.000001 },
    { name: "geofence_m", label: "Attendance radius (m)", type: "number", default: 300, help: "Check-ins farther than this are flagged" },
    { name: "notes", label: "Notes", type: "textarea" },
  ],
  listColumns: ["name", "owner_id", "type", "short_code", "city", "active"],
  reverse: [
    { entity: "staff", field: "business_unit_id", label: "Staff" },
    { entity: "bookings", field: "business_unit_id", label: "Bookings" },
    { entity: "rooms", field: "business_unit_id", label: "Rooms" },
    { entity: "rates", field: "business_unit_id", label: "Rates" },
    { entity: "daily-reports", field: "business_unit_id", label: "Daily reports" },
  ],
});
