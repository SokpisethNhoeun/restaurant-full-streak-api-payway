export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

const normalizedApiBase = API_BASE.replace(/\/$/, "");

export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  (normalizedApiBase
    ? `${normalizedApiBase}/ws`
    : typeof window !== "undefined"
      ? `${window.location.origin}/ws`
      : "/ws");

export async function api(path, options = {}) {
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const method = options.method || "GET";

  const headers = {
    ...(options.headers || {}),
    "ngrok-skip-browser-warning": "true",
  };

  if (!isFormData && method !== "GET") {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    method,
    headers,
    cache: options.cache ?? (method === "GET" ? "default" : "no-store"),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error || parsed.message || text;
    } catch {
      // Non-JSON error bodies are displayed as-is.
    }

    console.error("API error:", {
      url: `${API_BASE}${path}`,
      status: response.status,
      body: text,
    });

    const error = new Error(message || `Request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

export async function publicApi(path, options = {}) {
  return api(path, options);
}

export function authHeader(username, password) {
  return {
    Authorization: `Basic ${btoa(`${username}:${password}`)}`,
  };
}
