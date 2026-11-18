/** Only accept same-origin, absolute application paths for post-auth redirects. */
export function safeInternalPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")
    || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)
    || /%(?:2f|5c|0[ad]|25(?:2f|5c))/i.test(value)) {
    return fallback;
  }
  return value;
}
