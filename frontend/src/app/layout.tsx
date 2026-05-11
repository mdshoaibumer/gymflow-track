import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GymFlow Track — Gym Management Made Simple",
  description: "Modern gym management software for Indian fitness businesses. Track members, payments, attendance & more.",
  metadataBase: new URL("https://gymflowtrack.in"),
  openGraph: {
    title: "GymFlow Track — Gym Management Made Simple",
    description: "Modern gym management software for Indian fitness businesses. Track members, payments, attendance & more.",
    url: "https://gymflowtrack.in",
    siteName: "GymFlow Track",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GymFlow Track — Gym Management Made Simple",
    description: "Modern gym management software for Indian fitness businesses.",
  },
  alternates: {
    canonical: "https://gymflowtrack.in",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
