"use client";

import { useEffect } from "react";

let lockCount = 0;
let restoreState = null;

function acquireBodyScrollLock() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  let released = false;

  if (lockCount === 0) {
    const body = document.body;
    const html = document.documentElement;
    const scrollY = window.scrollY || html.scrollTop || 0;
    const scrollbarWidth = window.innerWidth - html.clientWidth;

    restoreState = {
      scrollY,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
      htmlOverflow: html.style.overflow,
      htmlOverscrollBehavior: html.style.overscrollBehavior,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
    html.style.overflow = "hidden";
    html.style.overscrollBehavior = "contain";
  }

  lockCount += 1;

  return () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);

    if (lockCount !== 0 || !restoreState) return;

    const body = document.body;
    const html = document.documentElement;
    const scrollY = restoreState.scrollY;

    body.style.position = restoreState.bodyPosition;
    body.style.top = restoreState.bodyTop;
    body.style.left = restoreState.bodyLeft;
    body.style.right = restoreState.bodyRight;
    body.style.width = restoreState.bodyWidth;
    body.style.overflow = restoreState.bodyOverflow;
    body.style.paddingRight = restoreState.bodyPaddingRight;
    html.style.overflow = restoreState.htmlOverflow;
    html.style.overscrollBehavior = restoreState.htmlOverscrollBehavior;
    restoreState = null;

    window.scrollTo(0, scrollY);
  };
}

export function useBodyScrollLock(locked, mediaQuery) {
  useEffect(() => {
    if (!locked || typeof window === "undefined") return undefined;

    const media = mediaQuery ? window.matchMedia(mediaQuery) : null;
    let releaseLock = null;

    const syncLock = () => {
      const shouldLock = !media || media.matches;

      if (shouldLock && !releaseLock) {
        releaseLock = acquireBodyScrollLock();
      }

      if (!shouldLock && releaseLock) {
        releaseLock();
        releaseLock = null;
      }
    };

    syncLock();
    media?.addEventListener("change", syncLock);

    return () => {
      media?.removeEventListener("change", syncLock);
      releaseLock?.();
    };
  }, [locked, mediaQuery]);
}
