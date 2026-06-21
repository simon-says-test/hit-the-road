// Touch-capability auto-detect, with a `?mobile=1`/`?mobile=0` URL override
// so mobile-only UI (virtual joystick, fire button) can be forced on/off
// from a desktop browser for testing without real touch hardware.
export function isMobileMode(): boolean {
  const override = new URLSearchParams(window.location.search).get("mobile");
  if (override === "1") return true;
  if (override === "0") return false;
  return navigator.maxTouchPoints > 0 || "ontouchstart" in window;
}
