import type { UrlOptions } from "./types";

/**
 * Safely parses a JSON string, returning the parsed object or the original string if parsing fails.
 * @param raw The JSON string to parse.
 * @returns The parsed object or the original string.
 */
export function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/**
 * Checks if an event name is reserved by the SSE protocol.
 * Reserved event names include "open", "error", and "message".
 * These names are used for standard events and should not be used for custom events.
 * @param eventName The event name to check.
 * @returns True if the event name is reserved, false otherwise.
 */
export function isReservedEvent(eventName: string): boolean {
  return (
    eventName === "open" || eventName === "error" || eventName === "message"
  );
}

/**
 * Builds a URL string from a string or UrlOptions object.
 * If a UrlOptions object is provided, it constructs the URL with query parameters.
 * @param urlInput The URL or UrlOptions to build the URL from.
 * @returns The constructed URL string.
 */
export function buildUrl(urlInput: string | UrlOptions): string {
  if (typeof urlInput === "string") {
    return urlInput;
  }
  const query = Object.entries(urlInput.query ?? {})
    .filter(([, v]) => v != null)
    .map(
      ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
    )
    .join("&");
  return `${urlInput.url}${query ? `?${query}` : ""}`;
}
