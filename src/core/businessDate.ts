"use client";
/**
 * The hotel's business day. After the night audit closes a day, the next day opens; until then
 * the app keeps working on the old day even after midnight. Before the first night audit the
 * calendar date is used.
 */
import { getStore } from "@/core/data";
import { addDays, calendarTodayISO, setBusinessDay } from "@/core/format";

export async function loadBusinessDay(): Promise<string> {
  const cal = calendarTodayISO();
  try {
    const last = (await getStore().list("night-audits", { sort: { field: "date", dir: "desc" }, limit: 1 }))[0];
    if (!last?.date) {
      setBusinessDay(null);
      return cal;
    }
    const next = addDays(String(last.date).slice(0, 10), 1);
    // Never more than one day ahead of the calendar (a day closed late in the evening).
    const day = next > addDays(cal, 1) ? addDays(cal, 1) : next;
    setBusinessDay(day === cal ? null : day);
    return day;
  } catch {
    setBusinessDay(null);
    return cal;
  }
}
