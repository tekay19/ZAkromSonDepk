import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { initWorkers } from "@/lib/worker-init";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: "Zakrom - Marketing Leads",
  description: "Find high-quality B2B leads globally.",
};

// Initialize worker only on server side
if (typeof window === "undefined") {
  initWorkers();
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          inter.variable,
          outfit.variable,
          "min-h-screen bg-background font-sans antialiased text-foreground"
        )}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
