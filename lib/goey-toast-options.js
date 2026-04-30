export const GOEY_TOAST_CLASS_NAMES = {
  wrapper: "happyboat-goey-toast",
  title: "happyboat-goey-toast-title",
  description: "happyboat-goey-toast-description",
  actionButton: "happyboat-goey-toast-action",
};

export function goeyToastOptions(options = {}) {
  return {
    showTimestamp: false,
    showProgress: true,
    timing: { displayDuration: 4500 },
    ...options,
    classNames: {
      ...GOEY_TOAST_CLASS_NAMES,
      ...(options.classNames || {}),
    },
  };
}
