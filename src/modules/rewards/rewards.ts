/** Incentive & bonus scheme + Employee of the Week / Month (from the scoreboard). Draft — management can change. */
import type { DataStore } from "@/core/data/types";
import { computeScoreboard, loadScoreboardData, type ScoreRow } from "@/modules/scoreboard/compute";

export const INCENTIVES = [
  { emoji: "🏅", title: "Employee of the Week", amount: 500, rule: "Highest score of the week (Mon–Sun)" },
  { emoji: "🏆", title: "Employee of the Month", amount: 2000, rule: "Highest score of the month + certificate" },
  { emoji: "⏰", title: "Perfect attendance", amount: 500, rule: "Present every working day, shift 1 on time (max 2 late) in the month" },
  { emoji: "✅", title: "Zero overdue", amount: 300, rule: "No overdue task all month, every job completed with photo" },
  { emoji: "⭐", title: "Guest praise", amount: 100, rule: "Per 5★ review that mentions you by name" },
  { emoji: "💼", title: "Sales incentive", amount: 200, rule: "Per room-night sold direct (front office / sales) · 3% of event bookings you bring" },
] as const;

export interface Awards { week: ScoreRow | null; month: ScoreRow | null; weekRows: ScoreRow[]; monthRows: ScoreRow[] }

export async function loadAwards(store: DataStore, unitId: string | null = null): Promise<Awards> {
  const [w, m] = await Promise.all([loadScoreboardData(store, "week", unitId), loadScoreboardData(store, "month", unitId)]);
  const weekRows = computeScoreboard(w).rows, monthRows = computeScoreboard(m).rows;
  const leader = (rows: ScoreRow[]) => (rows[0] && rows[0].score > 0 && (!rows[1] || rows[0].score > rows[1].score) ? rows[0] : rows[0] && rows[0].score > 0 ? rows[0] : null);
  return { week: leader(weekRows), month: leader(monthRows), weekRows, monthRows };
}
