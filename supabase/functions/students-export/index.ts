// students-export: the bot sends the course creator an Excel file with the
// course's students and their progress (Mini Apps can't save files reliably,
// a file in the chat opens anywhere and can be forwarded).
//
// Request: { init_data, course_id, tz_offset_minutes? }. The data comes from
// creator_students_report(), called with the caller's own permissions: it
// refuses anyone but the course's creator. The file goes only to the caller's
// own chat.
//
// Required secrets: TELEGRAM_BOT_TOKEN, APP_JWT_SECRET (same as auth-telegram).
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { corsHeaders, json, signJwt, verifyInitData } from "../_shared/telegram.ts";
import { buildXlsx, type Cell, type Sheet } from "../_shared/xlsx.ts";

type Lang = "ar" | "en";

/** Same as the app's "inactive" filter (insightsService.ts). */
const INACTIVE_AFTER_DAYS = 3;

interface Report {
  course_title: string;
  lessons: Array<{ id: string; title: string; module_title: string; completed: number }>;
  quizzes: Array<{ id: string; module_title: string; pass_percent: number; question_count: number }>;
  students: Array<{
    user_id: string;
    first_name: string;
    username: string | null;
    enrolled_at: string;
    last_activity_at: string;
    completed_lessons: number;
    current_lesson_title: string | null;
    certificate_code: string | null;
    certificate_issued_at: string | null;
    questions_asked: number;
  }>;
  quiz_results: Array<{
    user_id: string;
    quiz_id: string;
    best_score: number;
    total: number;
    passed: boolean;
    attempts: number;
    last_attempt_at: string;
  }>;
}

function pickLang(code: string | null | undefined): Lang {
  const c = code?.toLowerCase();
  return c && !c.startsWith("ar") ? "en" : "ar";
}

const T = {
  ar: {
    students: "الطلاب",
    quizzes: "الاختبارات",
    lessons: "الدروس",
    summary: "ملخص",
    cols: {
      n: "#", name: "الاسم", username: "المعرّف", enrolled: "تاريخ الالتحاق", lastActive: "آخر نشاط",
      done: "الدروس المكتملة", total: "عدد الدروس", progress: "نسبة الإنجاز", current: "آخر درس فتحه",
      quizzesPassed: "الاختبارات المجتازة", quizAvg: "متوسط الاختبارات", status: "الحالة",
      certCode: "رمز الشهادة", certDate: "تاريخ الشهادة", asked: "أسئلة طرحها",
      student: "الطالب", module: "الوحدة", best: "أفضل نتيجة", outOf: "من", pct: "النسبة",
      attempts: "المحاولات", result: "النتيجة", lastAttempt: "آخر محاولة",
      lesson: "الدرس", completedBy: "أكمله", completedPct: "نسبة الطلاب",
    },
    status: { completed: "أنهى الدورة", active: "نشط", inactive: `غير نشط (${INACTIVE_AFTER_DAYS}+ أيام)`, notStarted: "لم يبدأ" },
    passed: "ناجح",
    failed: "لم ينجح",
    notTaken: "لم يختبر",
    sum: {
      course: "الدورة", exported: "تاريخ التصدير", students: "عدد الطلاب", lessons: "عدد الدروس",
      completed: "أنهوا الدورة", active: "نشطون آخر 7 أيام", avg: "متوسط الإنجاز", certs: "شهادات صادرة",
      quizzes: "اختبارات الوحدات",
    },
    caption: (course: string, n: number) =>
      `📊 تقرير طلاب دورة «${course}»\n${n === 0 ? "لا يوجد طلاب بعد" : n === 1 ? "طالب واحد" : n === 2 ? "طالبان" : n <= 10 ? `${n} طلاب` : `${n} طالباً`}`,
    file: "طلاب",
  },
  en: {
    students: "Students",
    quizzes: "Quizzes",
    lessons: "Lessons",
    summary: "Summary",
    cols: {
      n: "#", name: "Name", username: "Username", enrolled: "Enrolled", lastActive: "Last active",
      done: "Lessons completed", total: "Total lessons", progress: "Progress", current: "Last opened lesson",
      quizzesPassed: "Quizzes passed", quizAvg: "Quiz average", status: "Status",
      certCode: "Certificate code", certDate: "Certificate date", asked: "Questions asked",
      student: "Student", module: "Module", best: "Best score", outOf: "Out of", pct: "Percent",
      attempts: "Attempts", result: "Result", lastAttempt: "Last attempt",
      lesson: "Lesson", completedBy: "Completed by", completedPct: "Share of students",
    },
    status: { completed: "Completed", active: "Active", inactive: `Inactive (${INACTIVE_AFTER_DAYS}+ days)`, notStarted: "Not started" },
    passed: "Passed",
    failed: "Not passed",
    notTaken: "Not taken",
    sum: {
      course: "Course", exported: "Exported", students: "Students", lessons: "Lessons",
      completed: "Completed the course", active: "Active in the last 7 days", avg: "Average progress",
      certs: "Certificates issued", quizzes: "Module quizzes",
    },
    caption: (course: string, n: number) => `📊 Students report for "${course}"\n${n === 1 ? "1 student" : `${n} students`}`,
    file: "students",
  },
};

const date = (iso: string | null | undefined): Date | null => (iso ? new Date(iso) : null);

/** Builds the workbook's sheets from the report. Exported for tests. */
export function reportSheets(r: Report, lang: Lang, now = new Date()): Sheet[] {
  const t = T[lang];
  const c = t.cols;
  const totalLessons = r.lessons.length;
  const quizCount = r.quizzes.length;
  const results = new Map<string, Report["quiz_results"]>();
  for (const q of r.quiz_results) {
    const list = results.get(q.user_id) ?? [];
    list.push(q);
    results.set(q.user_id, list);
  }
  const quizIds = new Set(r.quizzes.map((q) => q.id));
  const inactiveBefore = now.getTime() - INACTIVE_AFTER_DAYS * 86_400_000;
  const weekAgo = now.getTime() - 7 * 86_400_000;

  const finished = (s: Report["students"][number]) => totalLessons > 0 && s.completed_lessons >= totalLessons;
  const statusOf = (s: Report["students"][number]) =>
    finished(s)
      ? t.status.completed
      : s.completed_lessons === 0 && !(results.get(s.user_id)?.length)
        ? t.status.notStarted
        : new Date(s.last_activity_at).getTime() < inactiveBefore
          ? t.status.inactive
          : t.status.active;

  // Most progress first, then most recent activity.
  const students = [...r.students].sort(
    (a, b) => b.completed_lessons - a.completed_lessons || b.last_activity_at.localeCompare(a.last_activity_at),
  );

  const studentRows: Cell[][] = [[
    c.n, c.name, c.username, c.progress, c.done, c.total, c.status, c.lastActive, c.current,
    ...(quizCount ? [c.quizzesPassed, c.quizAvg] : []), c.certCode, c.certDate, c.asked, c.enrolled,
  ]];
  students.forEach((s, i) => {
    const mine = (results.get(s.user_id) ?? []).filter((q) => quizIds.has(q.quiz_id));
    const passed = mine.filter((q) => q.passed).length;
    const avg = mine.length ? mine.reduce((sum, q) => sum + (q.total ? q.best_score / q.total : 0), 0) / mine.length : null;
    studentRows.push([
      i + 1,
      s.first_name,
      s.username ? `@${s.username}` : "",
      { percent: totalLessons ? Math.min(1, s.completed_lessons / totalLessons) : 0 },
      s.completed_lessons,
      totalLessons,
      statusOf(s),
      date(s.last_activity_at),
      s.current_lesson_title ?? "",
      ...(quizCount ? [`${passed}/${quizCount}`, avg === null ? "" : { percent: avg }] : []),
      s.certificate_code ? `${s.certificate_code.slice(0, 5)}-${s.certificate_code.slice(5)}` : "",
      date(s.certificate_issued_at),
      s.questions_asked,
      date(s.enrolled_at),
    ] as Cell[]);
  });

  const sheets: Sheet[] = [{
    name: t.students,
    rows: studentRows,
    widths: [5, 24, 18, 12, 14, 11, 20, 17, 30, ...(quizCount ? [16, 16] : []), 16, 17, 12, 17],
  }];

  if (quizCount) {
    const quizRows: Cell[][] = [[c.student, c.username, c.module, c.result, c.best, c.outOf, c.pct, c.attempts, c.lastAttempt]];
    for (const s of students) {
      const mine = new Map((results.get(s.user_id) ?? []).map((q) => [q.quiz_id, q]));
      for (const quiz of r.quizzes) {
        const q = mine.get(quiz.id);
        quizRows.push(q
          ? [s.first_name, s.username ? `@${s.username}` : "", quiz.module_title, q.passed ? t.passed : t.failed,
            q.best_score, q.total, { percent: q.total ? q.best_score / q.total : 0 }, q.attempts, date(q.last_attempt_at)]
          : [s.first_name, s.username ? `@${s.username}` : "", quiz.module_title, t.notTaken, null, null, null, 0, null]);
      }
    }
    sheets.push({ name: t.quizzes, rows: quizRows, widths: [24, 18, 28, 13, 12, 8, 10, 11, 17] });
  }

  const n = r.students.length;
  sheets.push({
    name: t.lessons,
    rows: [
      [c.n, c.module, c.lesson, c.completedBy, c.completedPct],
      ...r.lessons.map((l, i) => [i + 1, l.module_title, l.title, l.completed, { percent: n ? l.completed / n : 0 }] as Cell[]),
    ],
    widths: [5, 28, 40, 12, 14],
  });

  const completed = r.students.filter(finished).length;
  const avgProgress = n && totalLessons
    ? r.students.reduce((sum, s) => sum + Math.min(1, s.completed_lessons / totalLessons), 0) / n
    : 0;
  sheets.push({
    name: t.summary,
    header: false,
    boldFirstColumn: true,
    widths: [26, 40],
    rows: [
      [t.sum.course, r.course_title],
      [t.sum.exported, now],
      [t.sum.students, n],
      [t.sum.lessons, totalLessons],
      [t.sum.quizzes, quizCount],
      [t.sum.completed, completed],
      [t.sum.active, r.students.filter((s) => new Date(s.last_activity_at).getTime() >= weekAgo).length],
      [t.sum.avg, { percent: avgProgress }],
      [t.sum.certs, r.students.filter((s) => s.certificate_code).length],
    ],
  });
  return sheets;
}

/** "طلاب - Course title - 2026-11-28.xlsx", without characters file systems reject. */
export function fileName(lang: Lang, course: string, now: Date, tz: number): string {
  const day = new Date(now.getTime() + tz * 60_000).toISOString().slice(0, 10);
  const safe = course.replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return `${T[lang].file} - ${safe || "course"} - ${day}.xlsx`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const jwtSecret = Deno.env.get("APP_JWT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!botToken || !jwtSecret || !supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("students-export: missing required environment variables");
    return json({ error: "Server is not configured" }, 500);
  }

  try {
    const body = await req.json().catch(() => null);
    const initData = typeof body?.init_data === "string" ? body.init_data : "";
    const courseId = typeof body?.course_id === "string" ? body.course_id : "";
    const tz = Number.isFinite(body?.tz_offset_minutes) ? Math.round(body.tz_offset_minutes) : 0;
    if (!courseId) return json({ error: "course_id is required" }, 400);

    const tgUser = await verifyInitData(initData, botToken);
    if (!tgUser) return json({ error: "Invalid Telegram session" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: user } = await admin.from("users").select("id").eq("telegram_id", tgUser.id).maybeSingle();
    if (!user) return json({ error: "User not found" }, 401);

    // The report is read as this user: the database checks they own the course.
    const { token } = await signJwt(
      { aud: "authenticated", role: "authenticated", sub: user.id, telegram_id: tgUser.id },
      jwtSecret,
      60,
    );
    const asUser = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data, error } = await asUser.rpc("creator_students_report", { p_course_id: courseId });
    if (error) {
      if (error.code === "42501") return json({ error: "forbidden" }, 403);
      throw error;
    }
    const report = data as Report;

    const lang = pickLang(tgUser.language_code);
    const now = new Date();
    const xlsx = buildXlsx(reportSheets(report, lang, now), { rtl: lang === "ar", tzOffsetMinutes: tz });

    const form = new FormData();
    form.append("chat_id", String(tgUser.id));
    form.append(
      "document",
      new Blob([xlsx as Uint8Array<ArrayBuffer>], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      fileName(lang, report.course_title, now, tz),
    );
    // No parse_mode: the course title is user-controlled text.
    form.append("caption", T[lang].caption(report.course_title.slice(0, 300), report.students.length));
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, { method: "POST", body: form });
    const sent = await res.json().catch(() => ({}));
    if (sent?.ok) return json({ sent: true, students: report.students.length });
    // 403: the creator never started the bot or blocked it.
    if (res.status === 403) return json({ error: "chat_unavailable" }, 409);
    console.error("students-export: Telegram error", res.status, sent?.description);
    return json({ error: "Telegram API returned an error" }, 502);
  } catch (err) {
    console.error("students-export error:", err);
    return json({ error: "Failed to export students" }, 500);
  }
});
