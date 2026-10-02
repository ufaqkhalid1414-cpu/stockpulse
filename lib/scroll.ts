let mode: "top" | "keep" = "keep";
let frame = 0;

export function markScrollTop() {
  mode = "top";
}

export function consumeScrollMode() {
  const current = mode;
  mode = "keep";
  return current;
}

export function animateScrollToTop() {
  cancelAnimationFrame(frame);
  const start = window.scrollY;
  const finish = () => window.scrollTo(0, 0);
  if (start <= 1) {
    finish();
    return;
  }
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    finish();
    return;
  }
  const duration = 420;
  const started = performance.now();
  const step = (now: number) => {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    window.scrollTo(0, Math.round(start * (1 - eased)));
    if (progress < 1) frame = requestAnimationFrame(step);
    else finish();
  };
  frame = requestAnimationFrame(step);
}
