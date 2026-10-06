"use client";
/**
 * "Complete" with proof: take a photo (back camera), the app stamps the person's name,
 * date, time and task onto the picture, then marks the task Done with that photo.
 */
import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, ImagePlus, X, RotateCcw } from "lucide-react";
import type { Row } from "@/core/schema/types";
import { getStore } from "@/core/data";
import { Button } from "./Button";
import { useToast } from "./Toast";

async function stamp(src: CanvasImageSource & { width: number; height: number }, lines: string[], mirror = false): Promise<string> {
  const max = 1280;
  const w0 = (src as HTMLVideoElement).videoWidth || src.width, h0 = (src as HTMLVideoElement).videoHeight || src.height;
  const scale = Math.min(1, max / Math.max(w0, h0));
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
  ctx.drawImage(src, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const fs = Math.max(16, Math.round(w / 34)), pad = Math.round(fs * 0.7), band = lines.length * fs * 1.35 + pad * 2;
  const g = ctx.createLinearGradient(0, h - band - fs, 0, h); g.addColorStop(0, "rgba(11,31,58,0)"); g.addColorStop(0.35, "rgba(11,31,58,.82)"); g.addColorStop(1, "rgba(11,31,58,.92)");
  ctx.fillStyle = g; ctx.fillRect(0, h - band - fs, w, band + fs);
  ctx.textBaseline = "top";
  lines.forEach((t, i) => {
    ctx.font = `${i === 0 ? "700" : "500"} ${i === 0 ? fs * 1.1 : fs}px -apple-system, Segoe UI, sans-serif`;
    ctx.fillStyle = i === 0 ? "#c9a227" : "#ffffff";
    ctx.fillText(t, pad, h - band + pad + i * fs * 1.35, w - pad * 2);
  });
  return c.toDataURL("image/jpeg", 0.82);
}

export function CompleteTaskDialog({ task, personName, onClose, onDone }: { task: Row | null; personName: string; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const video = useRef<HTMLVideoElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lines = () => {
    const now = new Date();
    return [
      `✓ ${personName}`,
      `${now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })} · ${now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
      `${String(task?.title ?? "Task")} · The Udaisarovar`,
    ];
  };

  useEffect(() => {
    if (!task) return;
    let s: MediaStream | null = null;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera API");
        s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
        setStream(s);
      } catch {
        setErr("Camera not available — choose a photo instead.");
      }
    })();
    return () => s?.getTracks().forEach((t) => t.stop());
  }, [task]);
  useEffect(() => {
    if (stream && video.current) { video.current.srcObject = stream; void video.current.play().catch(() => undefined); }
  }, [stream, photo]);

  if (!task) return null;
  const close = () => { stream?.getTracks().forEach((t) => t.stop()); setStream(null); setPhoto(null); onClose(); };
  const capture = async () => { if (video.current?.videoWidth) setPhoto(await stamp(video.current as unknown as HTMLVideoElement & { width: number; height: number }, lines())); };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    const bmp = await createImageBitmap(f);
    setPhoto(await stamp(bmp as unknown as ImageBitmap & { width: number; height: number }, lines()));
  };
  const save = async () => {
    if (!photo) return;
    setBusy(true);
    try {
      await getStore().update("tasks", task.id, { status: "Done", completed_at: new Date().toISOString(), completion_photo: photo });
      toast(`✅ Done: ${task.title} (+${Number(task.points ?? 1)} pt)`);
      stream?.getTracks().forEach((t) => t.stop());
      setStream(null); setPhoto(null);
      onDone();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Complete with photo proof</p>
            <h2 className="text-lg font-semibold text-navy">{String(task.title)}</h2>
            <p className="text-xs text-slate-500">Your name, date and time are stamped on the photo automatically.</p>
          </div>
          <button type="button" onClick={close} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-slate-900">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Proof" className="h-full w-full object-contain" />
            ) : stream ? (
              <video ref={video} playsInline muted autoPlay className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-300"><Camera className="h-8 w-8" />{err ?? "Opening camera…"}</div>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {photo ? (
              <>
                <Button icon={CheckCircle2} loading={busy} onClick={() => void save()} className="flex-1 bg-emerald-600 hover:bg-emerald-700">Mark complete</Button>
                <Button variant="secondary" icon={RotateCcw} onClick={() => setPhoto(null)}>Retake</Button>
              </>
            ) : (
              <>
                {stream && <Button icon={Camera} onClick={() => void capture()} className="flex-1">Take photo</Button>}
                <Button variant="secondary" icon={ImagePlus} onClick={() => file.current?.click()}>Choose photo</Button>
              </>
            )}
            <input ref={file} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>
      </div>
    </div>
  );
}
