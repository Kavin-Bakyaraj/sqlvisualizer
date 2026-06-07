import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SQL Visualizer",
  description: "Generate searchable ER diagrams from SQL schemas and export them as PNG, SVG, or PDF.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
