import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function usd(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function displayUsd(value) {
  return usd(value);
}

export function khr(value) {
  return `${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })} KHR`;
}

export function tags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(s / 60);
  const remainingSeconds = s % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
