"use client";

import { cloneElement, createContext, isValidElement, useContext, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const DropdownMenuContext = createContext({
  open: false,
  setOpen: () => {},
});

export function DropdownMenu({ children }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (!menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function onKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div ref={menuRef} className="relative inline-flex">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

export function DropdownMenuTrigger({ asChild = false, children, className, ...props }) {
  const { open, setOpen } = useDropdownMenu();

  const triggerProps = {
    "aria-expanded": open,
    "aria-haspopup": "menu",
    onClick: (event) => {
      props.onClick?.(event);
      if (!event.defaultPrevented) {
        setOpen((current) => !current);
      }
    },
  };

  if (asChild && isValidElement(children)) {
    return cloneElement(children, {
      ...props,
      ...triggerProps,
      className: cn(children.props.className, className),
      onClick: (event) => {
        children.props.onClick?.(event);
        triggerProps.onClick(event);
      },
    });
  }

  return (
    <button type="button" className={cn("inline-flex", className)} {...props} {...triggerProps}>
      {children}
    </button>
  );
}

export function DropdownMenuContent({ align = "end", side = "bottom", className, children, ...props }) {
  const { open } = useDropdownMenu();

  if (!open) return null;

  const sideClasses = {
    bottom: cn(
      "top-[calc(100%+0.5rem)]",
      align === "end" ? "right-0" : "left-0"
    ),
    right: cn(
      "left-[calc(100%+0.5rem)]",
      align === "end" ? "bottom-0" : "top-0"
    ),
    left: cn(
      "right-[calc(100%+0.5rem)]",
      align === "end" ? "bottom-0" : "top-0"
    ),
  };

  return (
    <div
      role="menu"
      className={cn(
        "absolute z-50 min-w-44 overflow-hidden rounded-md border border-border bg-card p-1 text-card-foreground shadow-xl outline-none",
        sideClasses[side] || sideClasses.bottom,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({ className, disabled = false, onSelect, children, ...props }) {
  const { setOpen } = useDropdownMenu();

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cn(
        "flex min-h-9 w-full items-center gap-2 rounded-sm px-2.5 py-2 text-left text-sm outline-none transition hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      onClick={(event) => {
        onSelect?.(event);
        if (!event.defaultPrevented) {
          setOpen(false);
        }
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function useDropdownMenu() {
  return useContext(DropdownMenuContext);
}
