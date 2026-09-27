/**
 * Generates the PWA icons (JD monogram, navy + gold) with sharp.
 * Run: bun run icons   (sharp is a dev dependency only)
 */
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const NAVY = "#0B1F3A";
const GOLD = "#C9A227";

function svg(size: number, maskable: boolean): string {
  // Maskable icons keep the monogram inside the 80% safe zone.
  const radius = maskable ? 0 : Math.round(size * 0.2);
  const font = Math.round(size * (maskable ? 0.36 : 0.44));
  const y = Math.round(size * (maskable ? 0.63 : 0.655));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${NAVY}"/>
  <circle cx="${size * 0.5}" cy="${size * 0.5}" r="${size * 0.42}" fill="none" stroke="${GOLD}" stroke-width="${Math.max(2, size * 0.02)}" opacity="0.35"/>
  <text x="50%" y="${y}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${font}" fill="${GOLD}" letter-spacing="${-size * 0.01}">JD</text>
</svg>`;
}

mkdirSync("public/icons", { recursive: true });
const jobs: [string, number, boolean][] = [
  ["public/icons/icon-192.png", 192, false],
  ["public/icons/icon-512.png", 512, false],
  ["public/icons/icon-maskable-512.png", 512, true],
  ["public/icons/apple-touch-icon.png", 180, true],
];
for (const [file, size, maskable] of jobs) {
  await sharp(Buffer.from(svg(size, maskable))).png().toFile(file);
  console.log("wrote", file);
}
writeFileSync("public/icons/icon.svg", svg(512, false));
console.log("wrote public/icons/icon.svg");
