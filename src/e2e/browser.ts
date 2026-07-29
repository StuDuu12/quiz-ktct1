export function isE2EBrowserMode() {
  if (typeof document !== "undefined") {
    return document.documentElement.dataset.e2eMode === "true";
  }
  return process.env.NEXT_PUBLIC_E2E_MODE === "1";
}
