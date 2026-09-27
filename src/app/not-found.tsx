import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold text-navy">Page not found</h1>
      <p className="text-sm text-slate-500">That link does not exist in JD One.</p>
      <Link href="/" className="rounded-lg bg-navy px-4 py-2 text-sm text-white">
        Go to dashboard
      </Link>
    </div>
  );
}
