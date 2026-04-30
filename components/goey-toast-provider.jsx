"use client";

import { useEffect, useState } from "react";
import { GooeyToaster } from "goey-toast";

export function GoeyToastProvider() {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    const root = document.documentElement;
    const updateTheme = () => setTheme(root.classList.contains("dark") ? "dark" : "light");
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <GooeyToaster
      position="top-center"
      closeButton="top-right"
      showProgress
      swipeToDismiss
      preset="smooth"
      theme={theme}
      gap={16}
      offset="16px"
      visibleToasts={4}
    />
  );
}
