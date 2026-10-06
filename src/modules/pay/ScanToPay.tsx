"use client";
/** Full-screen Udaisarovar "Scan to pay" QR that staff show to the guest after an order. */
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function ScanToPay() {
  const q = useSearchParams();
  const amount = Number(q.get("amount") || 0);
  const kot = q.get("kot");
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-2">
      <div className="flex w-full items-center justify-between">
        <Link href={kot ? "/kots/" : "/my-day/"} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        {kot && <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-navy">{kot}</span>}
      </div>
      {amount > 0 && (
        <div className="text-center">
          <div className="text-xs font-medium uppercase tracking-widest text-slate-500">Amount to pay</div>
          <div className="text-5xl font-bold tabular-nums text-navy">₹{amount.toLocaleString("en-IN")}</div>
        </div>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${base}/pay/udaisarovar-scan-to-pay.png`} alt="The Udaisarovar – scan to pay QR code" className="w-full max-w-md rounded-3xl shadow-2xl" />
      <p className="text-center text-sm text-slate-500">Show this screen to the guest. Ask them to share the payment screenshot, then mark the KOT as billed.</p>
    </div>
  );
}
