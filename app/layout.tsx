import type { Metadata } from "next";
import { DM_Sans, Noto_Nastaliq_Urdu, Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-sora",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-dm",
});

const urdu = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "700"],
  variable: "--font-urdu",
});

export const metadata: Metadata = {
  title: "VoiceUstad – AI Chemistry Tutor for FSc Students | Pakistan",
  description:
    "Learn FSc Chemistry with English text and Urdu voice explanations. KPK Board aligned. Rs. 499/month. Try free for 7 days.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sora.variable} ${dmSans.variable} ${urdu.variable}`}>
        {children}
      </body>
    </html>
  );
}
