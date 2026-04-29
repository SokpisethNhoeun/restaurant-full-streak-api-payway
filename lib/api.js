export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8080";

export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || "http://localhost:8080/ws";

export async function api(path, options = {}) {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  return contentType.includes("application/json")
    ? response.json()
    : response.text();
}

export async function publicApi(path, options = {}) {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  return contentType.includes("application/json")
    ? response.json()
    : response.text();
}

export function authHeader(username, password) {
  return {
    Authorization: `Basic ${btoa(`${username}:${password}`)}`,
  };
}