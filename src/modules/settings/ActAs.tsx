"use client";
/** Local mode only: preview the app as one of the staff members (role/team views). */
import { useAuth, useUser } from "@/core/auth/AuthProvider";
import { useList } from "@/core/ui/hooks";
import { Select } from "@/core/ui/Input";

export function ActAs() {
  const { mode, actAs } = useAuth();
  const user = useUser();
  const { rows } = useList(mode === "local" ? "staff" : null);
  if (mode !== "local") return null;
  return (
    <div className="border-t border-line px-4 py-3 text-sm">
      <label className="flex flex-wrap items-center gap-2">
        <span className="text-slate-700">Preview the app as:</span>
        <Select value={(user.staff?.id as string) ?? ""} onChange={(e) => void actAs(e.target.value || null)} className="w-auto">
          <option value="">Owner (all teams)</option>
          {rows.map((s) => (
            <option key={s.id} value={s.id}>
              {String(s.name)} — {String(s.role)}
            </option>
          ))}
        </Select>
      </label>
      <p className="mt-1 text-xs text-slate-500">Handy to check what each team sees. Switch back to Owner to return here.</p>
    </div>
  );
}
