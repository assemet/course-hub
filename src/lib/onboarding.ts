/** Whether the creator closed the first-run checklist (kept per device). */
const DISMISS_KEY = 'course-hub.onboarding.dismissed';

export function isOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissOnboarding(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // Private mode: it just shows again next time.
  }
}
