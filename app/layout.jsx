import "./globals.css";
import "goey-toast/styles.css";
import { GoeyToastProvider } from "@/components/goey-toast-provider";
import { AppHeroUIProvider } from "@/components/heroui-provider";
import { LanguageProvider } from "@/components/language-provider";
import { PwaController } from "@/components/pwa-controller";
import { Noto_Sans_Khmer } from "next/font/google";

const notoKhmer = Noto_Sans_Khmer({
  subsets: ["khmer"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-khmer",
});

export const metadata = {
  title: "HappyBoat QR Ordering",
  description: "Dine-in QR ordering with Bakong KHQR payments",
  applicationName: "HappyBoat",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "HappyBoat"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  openGraph: {
    title: "HappyBoat QR Ordering",
    description: "Mobile table ordering and staff operations.",
    type: "website",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "HappyBoat" }]
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0f8a7f"
};

const themeScript = `
(() => {
  try {
    const stored = localStorage.getItem("happyboat-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (stored === "dark" || (!stored && prefersDark)) {
      document.documentElement.classList.add("dark");
    }
  } catch {
    // Ignore storage access errors.
  }
})();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={notoKhmer.variable} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <AppHeroUIProvider>
          <LanguageProvider>
            {children}
            <PwaController />
            <GoeyToastProvider />
          </LanguageProvider>
        </AppHeroUIProvider>
      </body>
    </html>
  );
}
