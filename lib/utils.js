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
