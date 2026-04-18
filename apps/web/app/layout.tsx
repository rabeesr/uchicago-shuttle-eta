import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "UChicago Shuttle ETA",
  description: "Transparent ETAs for UChicago campus shuttles.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-50">
        <Nav />
        <div>{children}</div>
      </body>
    </html>
  );
}
