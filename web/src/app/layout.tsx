import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deck Agent",
  description: "Make the deck talk, then know when to hand off.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
