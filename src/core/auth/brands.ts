/**
 * The businesses shown on the sign-in screens (JD Group → business → property → login).
 * Logos live in /public/brands. `plate` is the colour of the round plate behind
 * the logo: "light" for logos drawn on white, "dark" for logos made for black,
 * "cover" for a round logo that fills the whole circle.
 */
export type Plate = "light" | "dark" | "cover";

export interface Brand {
  id: string;
  name: string;
  tagline: string;
  /** File name in /public/brands, or null when we have no logo yet (shows initials). */
  logo: string | null;
  initials?: string;
  plate: Plate;
}

export const BRANDS: Brand[] = [
  { id: "cpc", name: "CPC", tagline: "Real estate · since 1999", logo: "cpc.webp", plate: "light" },
  { id: "bpcl", name: "BPCL Barisadri", tagline: "Filling station · 1995", logo: "bpcl.webp", plate: "light" },
  { id: "pronite", name: "Pronite", tagline: "Nightlife & events", logo: "pronite.webp", plate: "dark" },
  { id: "jd-production", name: "JD Production", tagline: "Artists & stages", logo: null, initials: "JDP", plate: "dark" },
  { id: "illuzion", name: "Illuzion", tagline: "Bar & lounge", logo: "illuzion.webp", plate: "light" },
  { id: "casablanca", name: "Casablanca", tagline: "Pool bar & kitchen", logo: "casablanca.webp", plate: "dark" },
  { id: "pizzeria-locale", name: "Pizzeria Locale", tagline: "Pizza & grill", logo: "pizzeria.webp", plate: "light" },
  { id: "wine-house", name: "The Wine House", tagline: "Liquor store", logo: "winehouse.webp", plate: "light" },
  { id: "house-of-beauty", name: "House of Beauty", tagline: "Makeover studio", logo: "hob.webp", plate: "dark" },
  { id: "one-network", name: "One Network", tagline: "Members’ circle", logo: "onenetwork.webp", plate: "light" },
  { id: "stepwhere", name: "Stepwhere", tagline: "Investment", logo: "stepwhere.webp", plate: "dark" },
  { id: "aloe-e-cell", name: "Aloe E-Cell", tagline: "Investment", logo: null, initials: "AE", plate: "dark" },
];

/** JD Stays & Hospitality: the hotels, shown one by one after tapping the JD Stays card. */
export const STAYS_PROPERTIES: Brand[] = [
  { id: "udaisarovar", name: "The Udaisarovar", tagline: "Lakeside resort · Udaipur", logo: "udaisarovar.webp", plate: "cover" },
  { id: "artist-house", name: "The Artist House", tagline: "Hotel & club · Udaipur", logo: "artisthouse.webp", plate: "light" },
  { id: "belmonte-house", name: "The Belmonte House", tagline: "Boutique stay · Udaipur", logo: "belmonte.webp", plate: "light" },
  { id: "kirti-plaza", name: "Hotel Kirti Plaza", tagline: "Hotel · Chittorgarh", logo: null, initials: "KP", plate: "dark" },
  { id: "crown-fort-house", name: "Crown Fort House", tagline: "Opening 2028–30", logo: "crownfort.webp", plate: "light" },
];

export const JD_STAYS: Brand = { id: "jd-stays", name: "JD Stays & Hospitality", tagline: "Hotels & resorts", logo: "jd-stays.webp", plate: "dark" };

export function findBrand(id: string | null): Brand | null {
  if (!id) return null;
  return [...BRANDS, ...STAYS_PROPERTIES, JD_STAYS].find((b) => b.id === id) ?? null;
}

/** Remembered so the next screens (and the next visit) know which business the person chose. */
export const BRAND_STORAGE_KEY = "jdone.brand";
