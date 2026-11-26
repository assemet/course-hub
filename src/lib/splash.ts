/**
 * The splash screen lives in index.html so it shows before the JavaScript
 * bundle loads. The app calls hideSplash() once it is ready; the splash stays
 * at least MIN_VISIBLE_MS after its intro animation started (index.html sets
 * data-ready-at once the logo has loaded) so the intro isn't cut off on fast
 * connections, then fades out.
 */
const MIN_VISIBLE_MS = 1200;
const FADE_MS = 400;

let hiding = false;

export function hideSplash(): void {
  if (hiding) return;
  const el = document.getElementById('splash');
  if (!el) return;
  hiding = true;
  const startedAt = Number(el.dataset.readyAt ?? performance.now());
  const wait = Math.max(0, startedAt + MIN_VISIBLE_MS - performance.now());
  window.setTimeout(() => {
    el.classList.add('splash-out');
    window.setTimeout(() => el.remove(), FADE_MS);
  }, wait);
}
