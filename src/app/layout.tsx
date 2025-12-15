import type { Metadata } from "next";
import AuthProvider from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "OwnGram",
  description: "Web Messenger",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-outfit">
        <AuthProvider>
        {children}
        </AuthProvider>
      </body>
    </html>
  );
}
