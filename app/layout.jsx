import "./globals.css";
import "goey-toast/styles.css";
import { GoeyToastProvider } from "@/components/goey-toast-provider";
import { LanguageProvider } from "@/components/language-provider";

export const metadata = {
  title: "HappyBoat QR Ordering",
  description: "Dine-in QR ordering with Bakong KHQR payments"
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
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <LanguageProvider>
          {children}
          <GoeyToastProvider />
        </LanguageProvider>
      </body>
    </html>
  );
}
