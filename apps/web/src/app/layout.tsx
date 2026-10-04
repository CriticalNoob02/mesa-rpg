import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const plex = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex",
});
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Mesa RPG",
  description: "Mesa virtual de D&D 3.5 para jogar com os amigos.",
  referrer: "no-referrer",
};

export const viewport: Viewport = { themeColor: "#121010" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${plex.variable} ${fraunces.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
