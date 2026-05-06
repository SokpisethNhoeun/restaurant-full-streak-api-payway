export const GOEY_TOAST_CLASS_NAMES = {
  wrapper: "happyboat-goey-toast",
  title: "happyboat-goey-toast-title",
  description: "happyboat-goey-toast-description",
  actionButton: "happyboat-goey-toast-action",
};

// ─── Modern Renewed Dark Palette ─────────────────────────────────────────────
const PALETTE = {
  light: {
    main:   "hsl(220 10% 22%)",      // neutral-600
  },
  dark: {
    main:   "hsl(210 12% 40%)",   // modern teal
  },
};

function getColors() {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? PALETTE.dark : PALETTE.light;
}

export function goeyToastOptions(options = {}) {
  const { main } = getColors();

  return {
    showTimestamp: false,
    showProgress: true,
    fillColor:   main,
    timing: { displayDuration: 4000 },
    ...options,
    classNames: {
      ...GOEY_TOAST_CLASS_NAMES,
      ...(options.classNames || {}),
    },
  };
}