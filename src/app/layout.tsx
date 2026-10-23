import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Delivered Visual", template: "%s · Delivered Visual" },
  description: "Private photo and film delivery for clients.",
  robots: { index: false, follow: false }, // client deliveries are private
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
