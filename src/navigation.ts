import { ref } from "vue";
export const route = ref("");
export const routeLoading = ref(false);
let transition = 0;
function current() {
  return location.pathname + location.search;
}
export function navigate(path: string, replace = false) {
  const url = new URL(path || "/studio", location.origin);
  if (url.origin !== location.origin) return;
  if (current() !== url.pathname + url.search) {
    history[replace ? "replaceState" : "pushState"](
      {},
      "",
      url.pathname + url.search,
    );
    update();
  }
}
function update() {
  route.value = current();
  const ticket = ++transition;
  routeLoading.value = true;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (ticket === transition) routeLoading.value = false;
    }),
  );
}
export function installNavigation() {
  if (location.hash.startsWith("#/"))
    history.replaceState({}, "", location.hash.slice(1));
  if (location.pathname === "/")
    history.replaceState({}, "", "/studio" + location.search);
  route.value = current();
  addEventListener("popstate", update);
  addEventListener("hashchange", () => {
    if (location.hash.startsWith("#/")) navigate(location.hash.slice(1), true);
  });
  document.addEventListener("click", (event) => {
    if (
      event.defaultPrevented ||
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = (event.target as Element)?.closest("a");
    if (!link || link.target || link.hasAttribute("download")) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.pathname.startsWith("/api/"))
      return;
    if (
      !/^\/(studio|casting|characters|families|dialogue|stories|settings|world|economy|simulation|guide|experiments)(\/|$)/.test(
        url.pathname,
      )
    )
      return;
    event.preventDefault();
    navigate(url.pathname + url.search);
  });
}
