import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { TooltipProvider } from "@/components/ui/tooltip";
import WavesBackground from "@/components/ui/backgrounds/WavesBackground";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "KERI Cardano Transaction Attestation",
  description: "Attest Cardano transactions with KERI using Signify",
  icons: {
    icon: '/cardano-icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/cardano-icon.svg" type="image/svg+xml" />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} font-sans bg-[#050510] text-slate-100 antialiased min-h-screen`}
      >
        <WavesBackground />
        <Providers>
          <TooltipProvider delayDuration={300}>
            {children}
          </TooltipProvider>
        </Providers>
      </body>
    </html>
  );
}
