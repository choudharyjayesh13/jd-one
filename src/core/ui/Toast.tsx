"use client";
/** Toast notifications + a promise-based confirm dialog, both via context. */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { cn } from "./cn";

export type ToastKind = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (message: string, title?: string) => Promise<boolean>;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{ message: string; title?: string } | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3000);
  }, []);

  const confirm = useCallback((message: string, title?: string) => {
    setConfirmState({ message, title });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setConfirmState(null);
  };

  const api = useMemo(() => ({ toast, confirm }), [toast, confirm]);
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end">
        {toasts.map((t) => {
          const Icon = icons[t.kind];
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-white shadow-lg",
                t.kind === "success" && "bg-emerald-700",
                t.kind === "error" && "bg-red-700",
                t.kind === "info" && "bg-navy",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {t.message}
            </div>
          );
        })}
      </div>
      <Dialog open={Boolean(confirmState)} onClose={() => answer(false)} title={confirmState?.title ?? "Please confirm"}>
        <p className="text-sm text-slate-700">{confirmState?.message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => answer(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={() => answer(true)}>
            Confirm
          </Button>
        </div>
      </Dialog>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
