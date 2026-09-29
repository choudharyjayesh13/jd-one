"use client";
/**
 * Multi photo/video picker for `files` fields (maintenance tickets). Images are
 * resized to ≤1280px JPEG in the browser; videos are kept as-is but refused
 * above 25 MB. Values are data URLs until SupabaseStore uploads them to the
 * `tickets` bucket (LocalStore keeps the data URLs — heavy for videos).
 */
import { useRef, useState } from "react";
import { Camera, Play, Trash2, Video, Images } from "lucide-react";
import type { FileItem } from "@/core/schema/types";
import { storeKind } from "@/core/data";
import { Button } from "./Button";
import { toResizedDataUrl } from "./FileInput";
import { cn } from "./cn";

export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

/** Turn picked files into FileItems; returns the items plus any rejection messages. */
export async function filesToItems(files: File[]): Promise<{ items: FileItem[]; errors: string[] }> {
  const items: FileItem[] = [];
  const errors: string[] = [];
  for (const f of files) {
    if (f.type.startsWith("video/")) {
      if (f.size > MAX_VIDEO_BYTES) {
        errors.push(`${f.name}: video is ${(f.size / 1024 / 1024).toFixed(0)} MB — keep videos under 25 MB (record a shorter clip or lower the resolution).`);
        continue;
      }
      items.push({ url: await readAsDataUrl(f), type: "video", name: f.name, size: f.size });
    } else if (f.type.startsWith("image/")) {
      const url = await toResizedDataUrl(f);
      items.push({ url, type: "image", name: f.name.replace(/\.[^.]+$/, "") + ".jpg", size: Math.round((url.length * 3) / 4) });
    } else errors.push(`${f.name}: only photos and videos are accepted.`);
  }
  return { items, errors };
}

export function FilesInput({ value, onChange, disabled }: { value: FileItem[]; onChange: (v: FileItem[]) => void; disabled?: boolean }) {
  const photo = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = Array.isArray(value) ? value : [];

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setError(null);
    try {
      const { items: added, errors } = await filesToItems(Array.from(list));
      if (added.length) onChange([...items, ...added]);
      if (errors.length) setError(errors.join(" "));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {items.map((it, i) => (
            <li key={`${it.url.slice(0, 40)}-${i}`} className="relative aspect-square overflow-hidden rounded-lg border border-line bg-slate-100">
              {it.type === "video" ? (
                <video src={it.url} controls preload="metadata" className="h-full w-full object-cover" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt={it.name} className="h-full w-full object-cover" />
              )}
              {!disabled && (
                <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80" aria-label={`Remove ${it.name}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={Camera} disabled={disabled} loading={busy} onClick={() => photo.current?.click()}>
          Add photo
        </Button>
        <Button variant="secondary" size="sm" icon={Video} disabled={disabled} loading={busy} onClick={() => video.current?.click()}>
          Add video
        </Button>
        <Button variant="ghost" size="sm" icon={Images} disabled={disabled} loading={busy} onClick={() => gallery.current?.click()}>
          From gallery
        </Button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {storeKind === "local" && <p className="text-xs text-amber-700">Local mode: videos are stored inside this browser and make the database large. Prefer photos, or switch to shared mode.</p>}
      <input ref={photo} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void pick(e.target.files).then(() => (e.target.value = ""))} />
      <input ref={video} type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => void pick(e.target.files).then(() => (e.target.value = ""))} />
      <input ref={gallery} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => void pick(e.target.files).then(() => (e.target.value = ""))} />
    </div>
  );
}

/** Read-only gallery for detail pages: tap a photo for full size, videos play inline. */
export function MediaGallery({ items, className }: { items: FileItem[]; className?: string }) {
  const [open, setOpen] = useState<FileItem | null>(null);
  if (!items.length) return <span className="text-slate-400">—</span>;
  return (
    <>
      <ul className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6", className)}>
        {items.map((it, i) => (
          <li key={`${it.url.slice(0, 40)}-${i}`} className="relative aspect-square overflow-hidden rounded-lg border border-line bg-slate-100">
            <button type="button" className="h-full w-full" onClick={() => setOpen(it)} aria-label={`Open ${it.name}`}>
              {it.type === "video" ? (
                <span className="flex h-full w-full items-center justify-center bg-navy text-white">
                  <Play className="h-8 w-8" />
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt={it.name} className="h-full w-full object-cover" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setOpen(null)}>
          {open.type === "video" ? (
            <video src={open.url} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={open.url} alt={open.name} className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          )}
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/20 px-3 py-1 text-sm text-white" onClick={() => setOpen(null)}>
            Close
          </button>
        </div>
      )}
    </>
  );
}
