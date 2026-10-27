import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import ServiceWorker from "@/components/ServiceWorker";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const dmSans = localFont({
  src: "./fonts/dm-sans-latin.woff2",
  display: "swap",
  variable: "--font-dm-sans",
  weight: "400 700",
});
const newsreader = localFont({
  src: "./fonts/newsreader-latin.woff2",
  display: "swap",
  variable: "--font-newsreader",
  weight: "400 600",
});

export const metadata: Metadata = {
  title: "短词记 2.0",
  description: "本地优先的英语短语与句型记忆工具",
  applicationName: "短词记",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "短词记",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e7dac7",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${dmSans.variable} ${newsreader.variable}`}>
      <head>
        <link rel="manifest" href={`${basePath}/manifest.json`} />
        <link rel="apple-touch-icon" href={`${basePath}/icon.svg`} />
      </head>
      <body>
        <div className="app-frame">
          <div className="app-content">{children}</div>
          <BottomNav />
          <ServiceWorker />
        </div>
      </body>
    </html>
  );
}
