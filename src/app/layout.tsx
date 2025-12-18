import type { Metadata } from "next";
import AuthProvider from "@/components/AuthProvider";
import CallListenerProvider from "@/components/CallListenerProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "OwnGram",
  description: "Web Messenger",
  manifest: "/manifest.json",
  themeColor: "#0E1621",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "OwnGram",
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                const savedTheme = localStorage.getItem('theme') || 'dark-blue';
                const html = document.documentElement;
                html.classList.remove('light', 'dark', 'dark-blue');
                if (savedTheme === 'light') {
                  html.classList.add('light');
                } else if (savedTheme === 'dark') {
                  html.classList.add('dark');
                } else if (savedTheme === 'dark-blue') {
                  html.classList.add('dark', 'dark-blue');
                }
                html.setAttribute('data-theme', savedTheme);
              } catch (e) {}
            })();
          `
        }} />
      </head>
      <body className="antialiased font-outfit">
        <AuthProvider>
          <CallListenerProvider>
        {children}
          </CallListenerProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
