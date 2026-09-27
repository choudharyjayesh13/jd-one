"use client";
/** Shows local vs shared mode and the "Install app" prompt when the browser offers it. */
import { useEffect, useState } from "react";
import { Cloud, HardDrive, Download } from "lucide-react";
import { SUPABASE_URL, storeKind } from "@/core/data";
import { Button } from "@/core/ui/Button";
import { Card, CardBody, CardHeader } from "@/core/ui/Card";

type InstallEvent = Event & { prompt: () => Promise<void> };

export function BackendStatus() {
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(() => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => setInstalled(true);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const host = (() => {
    try {
      return new URL(SUPABASE_URL).host;
    } catch {
      return "";
    }
  })();

  return (
    <Card>
      <CardHeader title="Backend status" subtitle="Where your data lives" />
      <CardBody className="flex flex-wrap items-center gap-4 text-sm">
        {storeKind === "local" ? (
          <span className="inline-flex items-center gap-2 rounded-lg bg-gold/15 px-3 py-2 text-navy">
            <HardDrive className="h-4 w-4" /> Local mode – single device (IndexedDB). Export regularly from Data below.
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
            <Cloud className="h-4 w-4" /> Shared mode – Supabase ({host})
          </span>
        )}
        {installed ? (
          <span className="text-slate-500">Installed as an app on this device.</span>
        ) : install ? (
          <Button variant="secondary" icon={Download} onClick={() => void install.prompt()}>
            Install app
          </Button>
        ) : (
          <span className="text-xs text-slate-500">To install: Chrome/Android → menu → “Add to Home screen”; iPhone → Share → “Add to Home Screen”.</span>
        )}
      </CardBody>
    </Card>
  );
}
