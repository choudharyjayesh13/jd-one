/**
 * Local-mode PIN gate. The PIN is hashed (SHA-256 + fixed salt) and kept in
 * localStorage; it protects the phone from casual access, nothing more.
 */
const KEY = "jdone.pinHash";
const SESSION_KEY = "jdone.unlocked";

async function hash(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`jd-one:${pin}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hasPin(): boolean {
  try {
    return Boolean(localStorage.getItem(KEY));
  } catch {
    return false;
  }
}

export async function setPin(pin: string): Promise<void> {
  localStorage.setItem(KEY, await hash(pin));
}

export async function verifyPin(pin: string): Promise<boolean> {
  const stored = localStorage.getItem(KEY);
  return Boolean(stored) && stored === (await hash(pin));
}

export function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function markUnlocked(on: boolean) {
  if (on) sessionStorage.setItem(SESSION_KEY, "1");
  else sessionStorage.removeItem(SESSION_KEY);
}
