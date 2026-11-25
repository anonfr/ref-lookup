import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ref.lookup — Find Address from Referral Code",
  description:
    "Resolve referral codes, builder slugs, trader usernames, and wallet addresses across Hyperliquid, Lighter, and RISEx.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}
    >
      <body className="min-h-full bg-[#090a0d] text-[#ededed] font-sans selection:bg-[#7c5cff]/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
