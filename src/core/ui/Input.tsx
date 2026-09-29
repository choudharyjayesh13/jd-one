import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

const base =
  "w-full rounded-lg border border-line bg-white px-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-navy focus:outline-none focus:ring-2 focus:ring-gold/40 disabled:bg-slate-50 disabled:text-slate-500 sm:text-sm";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(base, "h-10", invalid && "border-red-500", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={3} className={cn(base, "py-2", invalid && "border-red-500", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, invalid, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(base, "h-10 appearance-none pr-8", invalid && "border-red-500", className)} {...rest}>
      {children}
    </select>
  );
});

/** Label + control + error/help text. `plain` renders a <div> for controls made of buttons (chips, galleries). */
export function Field({ label, required, error, help, children, wide, plain }: { label: string; required?: boolean; error?: string; help?: string; children: ReactNode; wide?: boolean; plain?: boolean }) {
  const Tag = plain ? "div" : "label";
  return (
    <Tag className={cn("block", wide && "sm:col-span-2")}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : help ? <span className="mt-1 block text-xs text-slate-500">{help}</span> : null}
    </Tag>
  );
}
