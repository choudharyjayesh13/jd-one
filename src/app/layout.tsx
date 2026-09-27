import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/core/ui/Providers";

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: { default: "JD One", template: "%s · JD One" },
  description: "JD Group staff operations app",
  manifest: `${base}/manifest.webmanifest`,
  icons: { icon: `${base}/icons/icon-192.png`, apple: `${base}/icons/apple-touch-icon.png` },
  appleWebApp: { capable: true, title: "JD One", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0B1F3A",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
