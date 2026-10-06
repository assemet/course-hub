const BOT_USERNAME = 'course_tracker_bot';

export function buildCourseDeepLink(courseId: string): string {
  return `https://t.me/${BOT_USERNAME}/app?startapp=course_${courseId}`;
}

export function parseStartAppParam(startApp: string | null): { courseId: string } | null {
  if (!startApp) return null;
  const match = startApp.match(/^course_(.+)$/);
  if (match) return { courseId: match[1] };
  return null;
}

export function getDeepLinkCourseId(): string | null {
  const tg = window.Telegram?.WebApp;
  if (tg?.initDataUnsafe) {
    // startapp param is not directly accessible via SDK; check URL params
  }

  const urlParams = new URLSearchParams(window.location.search);
  const tgWebAppStartParam = urlParams.get('tgWebAppStartParam');
  if (tgWebAppStartParam) {
    const parsed = parseStartAppParam(tgWebAppStartParam);
    if (parsed) return parsed.courseId;
  }

  // Also check hash params
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const hashStartParam = hashParams.get('tgWebAppStartParam');
  if (hashStartParam) {
    const parsed = parseStartAppParam(hashStartParam);
    if (parsed) return parsed.courseId;
  }

  return null;
}
