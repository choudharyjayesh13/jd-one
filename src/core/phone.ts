/**
 * Phone normalisation: Indian numbers are keyed by their 10-digit national
 * number so "+91 98290 12345", "098290-12345" and "9829012345" all match.
 * Foreign numbers keep all digits (with country code) so they still dedupe.
 */
export function normalizePhone(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length > 12) return digits.slice(-10);
  return digits;
}

export function formatPhone(p: unknown): string {
  const s = String(p ?? "");
  return /^\d{10}$/.test(s) ? `${s.slice(0, 5)} ${s.slice(5)}` : s;
}
