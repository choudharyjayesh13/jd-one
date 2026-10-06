"use client";
/** The Udaisarovar property photos used across the staff app (public/property/*). */
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const PROPERTY_PHOTOS = [
  { src: "pool-lake", caption: "Our pool facing Udai Sagar lake" },
  { src: "cottages-lawn", caption: "Our lakeside cottages" },
  { src: "cottage-dusk", caption: "Earth cottage at dusk" },
  { src: "lakeside-dinner", caption: "Lakeside dinner under the stars" },
  { src: "pool-garden", caption: "Pool, garden and the Aravalli hills" },
  { src: "cottage-room", caption: "Welcome in every room" },
  { src: "pool-palms", caption: "Morning by the pool" },
].map((p) => ({ ...p, url: `${base}/property/${p.src}.jpg` }));
export const UDAISAROVAR_LOGO = `${base}/property/udaisarovar-logo.jpg`;

/** Same photo all day, a different one each day. */
export function photoOfDay(offset = 0) {
  const d = new Date();
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  return PROPERTY_PHOTOS[(day + offset) % PROPERTY_PHOTOS.length];
}

export function PropertyStrip() {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
      <div className="flex items-center gap-3 px-5 pt-5 sm:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={UDAISAROVAR_LOGO} alt="The Udaisarovar" className="h-10 w-10 rounded-full object-cover" />
        <div>
          <h2 className="text-base font-semibold text-navy">The Udaisarovar – Lakeside Paradise</h2>
          <p className="text-xs text-slate-500">This is the place we build together every day · by JD Group</p>
        </div>
      </div>
      <div className="flex snap-x gap-3 overflow-x-auto px-5 pb-5 pt-4 sm:px-6">
        {PROPERTY_PHOTOS.map((p) => (
          <figure key={p.src} className="relative h-44 w-64 shrink-0 snap-start overflow-hidden rounded-xl sm:h-52 sm:w-72">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption} loading="lazy" className="h-full w-full object-cover transition duration-500 hover:scale-105" />
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-8 text-xs font-medium text-white">{p.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
