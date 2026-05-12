import type { Metadata, Viewport } from "next";
import { Caveat } from "next/font/google";
import "./globals.css";

const caveat = Caveat({
  subsets: ["cyrillic", "latin"],
  variable: "--font-hand",
  display: "swap",
});

export const metadata: Metadata = {
  title: "YouNotebook",
  description: "Личный local-first дневник",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className={caveat.variable}>{children}</body>
    </html>
  );
}
