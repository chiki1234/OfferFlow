export function getLoginDestination(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  try {
    const destination = new URL(value, "https://offerflow.invalid");
    if (destination.origin !== "https://offerflow.invalid") return "/";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}
