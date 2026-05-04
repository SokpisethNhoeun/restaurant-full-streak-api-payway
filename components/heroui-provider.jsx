"use client";

import { HeroUIProvider } from "@heroui/react";

export function AppHeroUIProvider({ children }) {
  return <HeroUIProvider>{children}</HeroUIProvider>;
}
