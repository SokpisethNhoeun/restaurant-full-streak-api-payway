"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PanelLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIDEBAR_WIDTH = "16rem";
const SIDEBAR_WIDTH_ICON = "4.5rem";

const SidebarContext = createContext({
  open: true,
  setOpen: () => {},
  openMobile: false,
  setOpenMobile: () => {},
  isDesktop: false,
  toggleSidebar: () => {},
  closeMobile: () => {},
});

export function SidebarProvider({ defaultOpen = true, children }) {
  const [desktopOpen, setDesktopOpen] = useState(defaultOpen);
  const [openMobile, setOpenMobile] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1280px) and (pointer: fine)");
    const updateIsDesktop = () => setIsDesktop(mediaQuery.matches);

    updateIsDesktop();
    mediaQuery.addEventListener("change", updateIsDesktop);
    return () => mediaQuery.removeEventListener("change", updateIsDesktop);
  }, []);

  useEffect(() => {
    if (isDesktop) {
      setOpenMobile(false);
    }
  }, [isDesktop]);

  const expanded = isDesktop ? desktopOpen : openMobile;

  const value = useMemo(
    () => ({
      open: expanded,
      setOpen: setDesktopOpen,
      openMobile,
      setOpenMobile,
      isDesktop,
      toggleSidebar: () => {
        if (isDesktop) {
          setDesktopOpen((current) => !current);
        } else {
          setOpenMobile((current) => !current);
        }
      },
      closeMobile: () => setOpenMobile(false),
    }),
    [expanded, isDesktop, openMobile]
  );

  return (
    <SidebarContext.Provider value={value}>
      <div
        className="group/sidebar-wrapper flex min-h-screen w-full"
        data-state={expanded ? "expanded" : "collapsed"}
        style={{
          "--sidebar-width": SIDEBAR_WIDTH,
          "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
        }}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ className, children, ...props }) {
  const { open, setOpenMobile, isDesktop } = useSidebar();

  return (
    <>
      {isDesktop ? (
        <aside
          className={cn(
            "sticky top-0 flex h-screen shrink-0 overflow-hidden flex-col border-r border-border bg-card text-card-foreground transition-[width] duration-200",
            open ? "w-[var(--sidebar-width)]" : "w-[var(--sidebar-width-icon)]",
            className
          )}
          data-state={open ? "expanded" : "collapsed"}
          {...props}
        >
          {children}
        </aside>
      ) : null}

      <AnimatePresence>
        {!isDesktop && open ? (
          <motion.button
            type="button"
            className="fixed inset-0 z-40 bg-black/35"
            aria-label="Close sidebar"
            onClick={() => setOpenMobile(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          />
        ) : null}
      </AnimatePresence>

      {!isDesktop ? (
        <aside
          className={cn(
            "sticky top-0 z-50 flex h-screen shrink-0 overflow-hidden flex-col border-r border-border bg-card text-card-foreground transition-[width,box-shadow] duration-200 ease-out",
            open
              ? "w-[min(var(--sidebar-width),86vw)] shadow-xl"
              : "w-[var(--sidebar-width-icon)]",
            className
          )}
          data-state={open ? "expanded" : "collapsed"}
          {...props}
        >
          {open ? (
            <div className="absolute right-2 top-2 z-10">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpenMobile(false)}
                aria-label="Close sidebar"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
          {children}
        </aside>
      ) : null}
    </>
  );
}

export function SidebarInset({ className, ...props }) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 bg-background transition-[padding,width] duration-200",
        className
      )}
      {...props}
    />
  );
}

export function SidebarTrigger({ className, ...props }) {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-10 w-10", className)}
      onClick={toggleSidebar}
      aria-label="Toggle sidebar"
      {...props}
    >
      <PanelLeft className="h-4 w-4" />
    </Button>
  );
}

export function SidebarHeader({ className, ...props }) {
  const { open, isDesktop } = useSidebar();

  return (
    <div
      className={cn("border-b border-border p-3", !isDesktop && open && "pr-12", className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }) {
  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3 transition-[padding,gap] duration-200 group-data-[state=collapsed]/sidebar-wrapper:gap-1 group-data-[state=collapsed]/sidebar-wrapper:px-2",
        className
      )}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }) {
  return <div className={cn("border-t border-border p-3", className)} {...props} />;
}

export function SidebarGroup({ className, ...props }) {
  return <div className={cn("grid gap-1", className)} {...props} />;
}

export function SidebarGroupLabel({ className, children, ...props }) {
  const { open } = useSidebar();

  return (
    <div
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-muted-foreground transition-opacity",
        !open && "pointer-events-none h-0 overflow-hidden p-0 opacity-0",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function SidebarMenu({ className, ...props }) {
  return <ul className={cn("grid gap-1", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }) {
  return <li className={cn("min-w-0", className)} {...props} />;
}

export function SidebarMenuButton({
  active = false,
  className,
  icon: Icon,
  label,
  onClick,
  children,
  ...props
}) {
  const { open, closeMobile } = useSidebar();
  const text = label || children;

  return (
    <button
      type="button"
      className={cn(
        "group/menu-button flex h-10 w-full min-w-0 items-center gap-3 rounded-md px-3 text-left text-sm font-medium outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary/20",
        active ? "bg-primary text-primary-foreground hover:bg-primary/90" : "text-muted-foreground hover:text-foreground",
        !open && "justify-center px-0",
        className
      )}
      title={!open && typeof text === "string" ? text : undefined}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        closeMobile();
        onClick?.(event);
      }}
      {...props}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      <span className={cn("min-w-0 truncate", !open && "sr-only")}>{children || label}</span>
    </button>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
