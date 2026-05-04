export const GOEY_TOAST_CLASS_NAMES = {
  wrapper: "happyboat-goey-toast",
  title: "happyboat-goey-toast-title",
  description: "happyboat-goey-toast-description",
  actionButton: "happyboat-goey-toast-action",
};

// ─── Modern Renewed Dark Palette ─────────────────────────────────────────────
const PALETTE = {
  light: {
    main:   "hsl(0 0% 35%)",      // neutral-600
    border: "hsl(0 0% 25%)",      // neutral-700
  },
  dark: {
    main:   "hsl(168 76% 42%)",   // modern teal
    border: "hsl(0 0% 20%)",      // dark neutral
  },
};

function getColors() {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return prefersDark ? PALETTE.dark : PALETTE.light;
}

export function goeyToastOptions(options = {}) {
  const { main, border } = getColors();

  return {
    showTimestamp: false,
    showProgress: true,
    fillColor:   main,
    borderColor: border,
    timing: { displayDuration: 4000 },
    ...options,
    classNames: {
      ...GOEY_TOAST_CLASS_NAMES,
      ...(options.classNames || {}),
    },
  };
}