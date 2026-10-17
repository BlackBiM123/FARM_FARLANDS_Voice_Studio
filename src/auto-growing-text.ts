import type { App } from "vue";
export function installAutoGrowingText(app: App) {
  const observed = new Map<
    HTMLTextAreaElement,
    { value: string; width: number }
  >();
  let frame = 0;
  const resize = new ResizeObserver((entries) => {
    if (
      entries.some((entry) => {
        const previous = observed.get(entry.target as HTMLTextAreaElement);
        return (
          previous &&
          Math.abs(previous.width - (entry.target as HTMLElement).clientWidth) >
            1
        );
      })
    )
      schedule();
  });
  function refresh() {
    frame = 0;
    for (const [element] of observed)
      if (!element.isConnected) {
        resize.unobserve(element);
        observed.delete(element);
      }
    document
      .querySelectorAll<HTMLTextAreaElement>("textarea")
      .forEach((element) => {
        const width = element.clientWidth;
        if (!width || !element.getClientRects().length) return;
        const previous = observed.get(element);
        if (previous?.value === element.value && previous.width === width)
          return;
        if (!previous) {
          resize.observe(element);
          element.classList.add("auto-growing-text");
        }
        element.rows = 1;
        element.style.height = "0px";
        const style = getComputedStyle(element);
        const borders =
          parseFloat(style.borderTopWidth) +
          parseFloat(style.borderBottomWidth);
        element.style.height = Math.ceil(element.scrollHeight + borders) + "px";
        observed.set(element, { value: element.value, width });
      });
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(refresh);
  }
  app.mixin({ mounted: schedule, updated: schedule });
  document.addEventListener("input", (event) => {
    if (event.target instanceof HTMLTextAreaElement) schedule();
  });
  document.addEventListener("toggle", schedule, true);
  window.addEventListener("resize", schedule);
  document.fonts.ready.then(schedule);
}
