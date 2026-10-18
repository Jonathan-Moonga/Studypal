import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyPal",
  description: "A calm, focused study space for every learning goal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
