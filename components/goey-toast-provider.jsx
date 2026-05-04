"use client";

import { GooeyToaster } from "goey-toast";

export function GoeyToastProvider() {
  return (
    <GooeyToaster
      position="top-center"
      closeButton="top-right"
      showProgress
      swipeToDismiss
      preset="smooth"
      theme="system"        // ← was "light", now follows OS preference
      gap={16}
      offset="16px"
      visibleToasts={4}
      duration={4000}
    />
  );
}