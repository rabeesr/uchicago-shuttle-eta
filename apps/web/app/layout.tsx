import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Nav from "@/components/Nav";
import AlertsBanner from "@/components/AlertsBanner";
import { UserLocationProvider } from "@/hooks/useUserLocation";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  title: "UChicago Shuttle ETA",
  description: "Transparent ETAs for UChicago campus shuttles.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
        <body className="min-h-full flex flex-col bg-background text-foreground">
          <UserLocationProvider>
            <Nav />
            <AlertsBanner />
            <main className="flex-1">{children}</main>
          </UserLocationProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
