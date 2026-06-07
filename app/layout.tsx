import type { Metadata, Viewport } from "next";
import { Caveat, Lacquer } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const caveat = Caveat({
  subsets: ["cyrillic", "latin"],
  variable: "--font-hand",
  display: "swap",
});

const lacquer = Lacquer({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-logo",
  display: "swap",
});

const pixpopenei = localFont({
  src: "../public/fonts/pixpopenei.ttf",
  variable: "--font-refound",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Refound",
  description: "Пространство для рефов, мыслей и быстрых входящих",
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
      <body
        className={`${caveat.variable} ${lacquer.variable} ${pixpopenei.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
