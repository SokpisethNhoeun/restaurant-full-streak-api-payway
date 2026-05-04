"use client";

import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

const HoverCardContext = createContext({
  openDelay: 120,
  closeDelay: 120,
});

export function HoverCard({ openDelay = 120, closeDelay = 120, children }) {
  return (
    <HoverCardContext.Provider value={{ openDelay, closeDelay }}>
      <div className="group/hover-card relative inline-flex">{children}</div>
    </HoverCardContext.Provider>
  );
}

export function HoverCardTrigger({ asChild = false, children, className, ...props }) {
  if (asChild) {
    return children;
  }

  return (
    <div className={cn("inline-flex", className)} {...props}>
      {children}
    </div>
  );
}

export function HoverCardContent({ align = "end", className, ...props }) {
  const { openDelay, closeDelay } = useContext(HoverCardContext);

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-[calc(100%+0.5rem)] z-50 w-72 rounded-md border border-border bg-card p-4 text-card-foreground opacity-0 shadow-xl outline-none transition-opacity before:absolute before:-top-2 before:left-0 before:h-2 before:w-full before:content-[''] group-hover/hover-card:pointer-events-auto group-hover/hover-card:opacity-100 group-focus-within/hover-card:pointer-events-auto group-focus-within/hover-card:opacity-100",
        align === "end" ? "right-0" : "left-0",
        className
      )}
      style={{
        transitionDelay: `${openDelay}ms`,
        "--hover-card-close-delay": `${closeDelay}ms`,
      }}
      {...props}
    />
  );
}
