import type { ReactNode } from "react";
import { cn } from "./cn";

/** Horizontal-scroll table wrapper; rows are clickable when onRowClick is given. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-line bg-white shadow-sm", className)}>
      <table className="w-full min-w-[560px] text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("whitespace-nowrap border-b border-line bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500", className)}>{children}</th>;
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("border-b border-line/60 px-3 py-2 align-top", className)}>{children}</td>;
}
