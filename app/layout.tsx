import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "隊伍紀錄器｜戰術地圖標記工具",
  description: "上傳地圖或建立空白版面，放置標點、記錄隊員位置並繪製戰術圖形。",
  openGraph: {
    title: "隊伍紀錄器｜戰術地圖標記工具",
    description: "上傳地圖・標記位置・協同規劃",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "隊伍紀錄器" }],
    locale: "zh_TW",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "隊伍紀錄器｜戰術地圖標記工具",
    description: "上傳地圖・標記位置・協同規劃",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-Hant" className="dark"><body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body></html>;
}
