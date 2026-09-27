"use client";
/** Monthly sales target per business unit (upserts into `targets`). */
import { useState } from "react";
import { Save } from "lucide-react";
import { getStore } from "@/core/data";
import { currentMonth, formatMonth } from "@/core/format";
import { useUser } from "@/core/auth/AuthProvider";
import { Button } from "@/core/ui/Button";
import { Card, CardBody, CardHeader } from "@/core/ui/Card";
import { Input } from "@/core/ui/Input";
import { useList } from "@/core/ui/hooks";
import { useToast } from "@/core/ui/Toast";

export function TargetsEditor() {
  const user = useUser();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const { rows: units } = useList("business-units");
  const { rows: targets, reload } = useList("targets", { filter: { month } });
  // Unsaved edits sit on top of the stored targets; cleared when the month changes.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const values: Record<string, string> = {};
  for (const t of targets) values[String(t.business_unit_id)] = String(t.target_amount ?? "");
  Object.assign(values, edits);

  const save = async () => {
    setSaving(true);
    try {
      const store = getStore();
      for (const u of units) {
        const raw = values[u.id];
        const existing = targets.find((t) => t.business_unit_id === u.id);
        if (raw === undefined || raw === "") {
          if (existing) await store.remove("targets", existing.id);
          continue;
        }
        const amount = Number(raw);
        if (existing) await store.update("targets", existing.id, { target_amount: amount });
        else await store.create("targets", { business_unit_id: u.id, month, target_amount: amount, created_by: (user.staff?.id as string) ?? null });
      }
      toast(`Targets saved for ${formatMonth(month)}`);
      setEdits({});
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Sales targets" subtitle="Per unit per month; the dashboard compares daily-report sales against these" action={<Input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setEdits({});
            }}
            className="w-auto"
          />} />
      <CardBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {units
            .filter((u) => u.active !== false)
            .map((u) => (
              <label key={u.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700">{String(u.name)}</span>
                <Input type="number" inputMode="numeric" min={0} step={1000} placeholder="₹" className="w-40 text-right" value={values[u.id] ?? ""} onChange={(e) => setEdits((v) => ({ ...v, [u.id]: e.target.value }))} />
              </label>
            ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button icon={Save} loading={saving} onClick={() => void save()}>
            Save targets
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
