import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UChicago Shuttle ETA",
  description: "Transparent ETAs for UChicago campus shuttles.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-50">
        {children}
      </body>
    </html>
  );
}
