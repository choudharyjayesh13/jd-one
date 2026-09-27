"use client";
/**
 * Image picker. The picture is resized in the browser (max 1280px, JPEG) and
 * handed over as a data URL; LocalStore keeps it, SupabaseStore uploads it.
 */
import { useRef } from "react";
import { Camera, Trash2 } from "lucide-react";
import { Button } from "./Button";

async function toResizedDataUrl(file: File, max = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function FileInput({ value, onChange, disabled }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="Receipt" className="h-20 w-20 rounded-lg border border-line object-cover" />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-line text-slate-300">
          <Camera className="h-6 w-6" />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Button variant="secondary" size="sm" icon={Camera} disabled={disabled} onClick={() => input.current?.click()}>
          {value ? "Replace photo" : "Add photo"}
        </Button>
        {value && (
          <Button variant="ghost" size="sm" icon={Trash2} disabled={disabled} onClick={() => onChange(null)}>
            Remove
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) onChange(await toResizedDataUrl(f));
          e.target.value = "";
        }}
      />
    </div>
  );
}
