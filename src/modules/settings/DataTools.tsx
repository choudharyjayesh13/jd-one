"use client";
/** Export/import JSON, demo data, PIN change. */
import { useRef, useState } from "react";
import { Download, Upload, Sparkles, Trash2, KeyRound } from "lucide-react";
import { getStore, storeKind, type ExportBundle } from "@/core/data";
import { clearDemoData, hasDemoData, seedDemoData } from "@/core/data/demo";
import { downloadText } from "@/core/csv";
import { todayISO } from "@/core/format";
import { setPin } from "@/core/auth/pin";
import { Button } from "@/core/ui/Button";
import { Card, CardBody, CardHeader } from "@/core/ui/Card";
import { Input } from "@/core/ui/Input";
import { useToast } from "@/core/ui/Toast";

export function DataTools() {
  const { toast, confirm } = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pin, setPinValue] = useState("");
  const [demo, setDemo] = useState(() => (typeof window !== "undefined" ? hasDemoData() : false));

  const run = async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const exportJson = () =>
    run(
      "export",
      async () => {
        const bundle = await getStore().exportAll();
        downloadText(`jd-one-backup-${todayISO()}.json`, JSON.stringify(bundle, null, 2), "application/json");
      },
      "Backup downloaded",
    );

  const importJson = async (f: File) => {
    const text = await f.text();
    let bundle: ExportBundle;
    try {
      bundle = JSON.parse(text) as ExportBundle;
    } catch {
      toast("That file is not a JD One backup", "error");
      return;
    }
    if (bundle.app !== "jd-one" || !bundle.tables) {
      toast("That file is not a JD One backup", "error");
      return;
    }
    const total = Object.values(bundle.tables).reduce((n, rows) => n + rows.length, 0);
    if (!(await confirm(`Import ${total} records from ${bundle.exportedAt?.slice(0, 10)}? Records with the same id are replaced; nothing else is deleted.`))) return;
    await run("import", () => getStore().importAll(bundle), `Imported ${total} records`);
  };

  return (
    <Card>
      <CardHeader title="Data" subtitle="Backups, demo data and device PIN" />
      <CardBody className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Download} loading={busy === "export"} onClick={() => void exportJson()}>
            Export all data (JSON)
          </Button>
          <Button variant="secondary" icon={Upload} loading={busy === "import"} onClick={() => file.current?.click()}>
            Import JSON backup
          </Button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = "";
            }}
          />
        </div>
        <p className="text-xs text-slate-500">
          {storeKind === "local" ? "Export before switching to shared mode, then import the same file once Supabase is connected — all records keep their ids and links." : "Exports come from Supabase; importing upserts by id (owner only)."}
        </p>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {demo ? (
            <Button
              variant="danger"
              icon={Trash2}
              loading={busy === "clear"}
              onClick={async () => {
                if (!(await confirm("Remove the demo leads, bookings, staff and reports? Records you added yourself are kept."))) return;
                await run("clear", clearDemoData, "Demo data removed");
                setDemo(false);
              }}
            >
              Clear demo data
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon={Sparkles}
              loading={busy === "seed"}
              onClick={async () => {
                await run("seed", seedDemoData, "Demo data added");
                setDemo(true);
              }}
            >
              Add demo data
            </Button>
          )}
        </div>

        {storeKind === "local" && (
          <form
            className="flex flex-wrap items-end gap-2 border-t border-line pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^\d{4}$/.test(pin)) return toast("PIN must be 4 digits", "error");
              void run("pin", () => setPin(pin), "PIN changed").then(() => setPinValue(""));
            }}
          >
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Change device PIN</span>
              <Input type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))} className="w-32 text-center tracking-[0.5em]" />
            </label>
            <Button type="submit" variant="secondary" icon={KeyRound} loading={busy === "pin"}>
              Save PIN
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
}
