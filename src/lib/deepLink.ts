import { getTelegramStartParam } from './telegram';

// Set VITE_BOT_USERNAME (without @) to your bot's username.
const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string | undefined)?.replace(/^@/, '') || 'course_tracker_bot';

/** Direct chat with the bot, where creators forward posts to import them. */
export function buildBotChatLink(): string {
  return `https://t.me/${BOT_USERNAME}`;
}

export function buildCourseDeepLink(courseId: string): string {
  return `https://t.me/${BOT_USERNAME}/app?startapp=course_${courseId}`;
}

export function buildCertificateVerifyLink(code: string): string {
  return `https://t.me/${BOT_USERNAME}/app?startapp=cert_${code}`;
}

export type DeepLinkTarget = { courseId: string } | { certificateCode: string } | { questionLessonId: string };

export function parseStartAppParam(startApp: string | null): DeepLinkTarget | null {
  if (!startApp) return null;
  const course = startApp.match(/^course_(.+)$/);
  if (course) return { courseId: course[1] };
  // Certificate codes are 10 characters from [A-Z2-9].
  const cert = startApp.match(/^cert_([A-Za-z0-9]{6,20})$/);
  if (cert) return { certificateCode: cert[1].toUpperCase() };
  // q_<lesson id>: from a bot message about a question; opens the lesson's questions.
  const question = startApp.match(/^q_([0-9a-fA-F-]{36})$/);
  if (question) return { questionLessonId: question[1].toLowerCase() };
  return null;
}

/** What the Mini App was opened for (a course, a lesson's questions, a certificate to verify), if anything. */
export function getDeepLinkTarget(): DeepLinkTarget | null {
  // Preferred: the SDK exposes the `startapp` value as start_param.
  const sdkParam = parseStartAppParam(getTelegramStartParam());
  if (sdkParam) return sdkParam;

  // Fallbacks for clients that only pass it through the launch URL (query or hash).
  const fromQuery = new URLSearchParams(window.location.search).get('tgWebAppStartParam');
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('tgWebAppStartParam');
  return parseStartAppParam(fromQuery) ?? parseStartAppParam(fromHash);
}

export function getDeepLinkCourseId(): string | null {
  const target = getDeepLinkTarget();
  return target && 'courseId' in target ? target.courseId : null;
}
