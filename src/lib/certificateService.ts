import { supabase } from './supabase';
import { getTelegramInitData } from './telegram';
import type { Lang } from './i18n';

export interface Certificate {
  id: string;
  code: string;
  user_id: string;
  course_id: string;
  student_name: string;
  course_title: string;
  creator_name: string;
  lesson_count: number;
  issued_at: string;
}

export type VerifiedCertificate = Pick<
  Certificate,
  'code' | 'student_name' | 'course_title' | 'creator_name' | 'lesson_count' | 'issued_at'
>;

/** "ABCDE12345" -> "ABCDE-12345" (easier to read and type). */
export function formatCertificateCode(code: string): string {
  return code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
}

export async function fetchMyCertificate(userId: string, courseId: string): Promise<Certificate | null> {
  const { data, error } = await supabase
    .from('certificates')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();
  if (error) throw error;
  return (data as Certificate | null) ?? null;
}

export type IssueError = 'lessons' | 'quizzes' | 'name' | 'enroll' | 'other';

/** Maps the database's English error messages to UI states. */
export function classifyIssueError(message: string): IssueError {
  if (/every lesson/i.test(message)) return 'lessons';
  if (/quiz/i.test(message)) return 'quizzes';
  if (/name must be/i.test(message)) return 'name';
  if (/not enrolled/i.test(message)) return 'enroll';
  return 'other';
}

/** Issued in the database only if every lesson is completed and every quiz passed. */
export async function issueCertificate(courseId: string, name: string): Promise<Certificate> {
  const { data, error } = await supabase.rpc('issue_certificate', { p_course_id: courseId, p_name: name });
  if (error) throw error;
  return data as Certificate;
}

export async function verifyCertificate(code: string): Promise<VerifiedCertificate | null> {
  const { data, error } = await supabase.rpc('verify_certificate', { p_code: code });
  if (error) throw error;
  const rows = (data ?? []) as VerifiedCertificate[];
  return rows[0] ?? null;
}

/** The bot sends the rendered image to the student's chat, with a verify button. */
export async function sendCertificateToChat(certificateId: string, image: Blob): Promise<'sent' | 'chat_unavailable' | 'failed'> {
  const form = new FormData();
  form.append('init_data', getTelegramInitData());
  form.append('certificate_id', certificateId);
  form.append('image', image, 'certificate.png');
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/certificate-send`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: form,
    });
    if (response.ok) return 'sent';
    const data = await response.json().catch(() => ({}));
    return data?.error === 'chat_unavailable' ? 'chat_unavailable' : 'failed';
  } catch {
    return 'failed';
  }
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

const W = 2000;
const H = 1414;
const FONT = '"Noto Naskh Arabic", "Geeza Pro", "Segoe UI", Tahoma, "Noto Sans", Arial, sans-serif';

const TEXT: Record<Lang, Record<string, string>> = {
  ar: {
    title: 'شهادة إتمام',
    certifies: 'نشهد بأن',
    completed: 'أتمّ بنجاح دورة',
    teacher: 'المدرّس',
    lessons: 'عدد الدروس',
    date: 'تاريخ الإصدار',
    code: 'رمز التحقق',
  },
  en: {
    title: 'Certificate of Completion',
    certifies: 'This certifies that',
    completed: 'has successfully completed the course',
    teacher: 'Teacher',
    lessons: 'Lessons',
    date: 'Issued on',
    code: 'Verification code',
  },
};

/** Splits text into at most `maxLines` lines that fit `maxWidth`. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

/** Largest font size (<= start) at which `text` fits on one line. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, start: number, maxWidth: number): number {
  let size = start;
  while (size > 40) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  return size;
}

/** Draws the certificate (2000x1414 PNG). Text comes from the issued record. */
export async function renderCertificate(cert: Certificate, lang: Lang): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported');
  const tr = TEXT[lang];
  const rtl = lang === 'ar';
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const cx = W / 2;

  // Background and frame
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#1d4ed8');
  grad.addColorStop(1, '#3b82f6');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 28;
  ctx.strokeRect(50, 50, W - 100, H - 100);
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 4;
  ctx.strokeRect(90, 90, W - 180, H - 180);

  // Header
  ctx.fillStyle = '#64748b';
  ctx.font = `600 40px ${FONT}`;
  ctx.fillText('Course Hub', cx, 190);
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold ${rtl ? 120 : 104}px ${FONT}`;
  ctx.fillText(tr.title, cx, 320);

  // Gold rule
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(cx - 160, 410, 320, 6);

  ctx.fillStyle = '#475569';
  ctx.font = `48px ${FONT}`;
  ctx.fillText(tr.certifies, cx, 500);

  // Student name
  const nameSize = fitFont(ctx, cert.student_name, 'bold', 128, W - 400);
  ctx.font = `bold ${nameSize}px ${FONT}`;
  ctx.fillStyle = '#1d4ed8';
  ctx.fillText(cert.student_name, cx, 630);

  ctx.fillStyle = '#475569';
  ctx.font = `48px ${FONT}`;
  ctx.fillText(tr.completed, cx, 760);

  // Course title (up to 2 lines)
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold 80px ${FONT}`;
  const titleLines = wrap(ctx, cert.course_title, W - 440, 2);
  titleLines.forEach((line, i) => ctx.fillText(line, cx, 880 + i * 100 - (titleLines.length - 1) * 50));

  // Details row
  const date = new Date(cert.issued_at).toLocaleDateString(rtl ? 'ar-u-nu-latn' : 'en', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const details = [
    `${tr.teacher}: ${cert.creator_name}`,
    `${tr.lessons}: ${cert.lesson_count}`,
    `${tr.date}: ${date}`,
  ];
  ctx.fillStyle = '#334155';
  ctx.font = `40px ${FONT}`;
  const colW = (W - 400) / 3;
  details.forEach((d, i) => {
    // Columns run right-to-left in Arabic.
    const col = rtl ? 2 - i : i;
    ctx.fillText(d, 200 + colW * col + colW / 2, 1080, colW - 30);
  });

  // Seal
  const sealX = rtl ? 290 : W - 290;
  ctx.beginPath();
  ctx.arc(sealX, 1210, 70, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(sealX, 1210, 56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sealX - 26, 1212);
  ctx.lineTo(sealX - 6, 1234);
  ctx.lineTo(sealX + 30, 1190);
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Verification code
  ctx.fillStyle = '#64748b';
  ctx.font = `36px ${FONT}`;
  ctx.fillText(tr.code, cx, 1190);
  ctx.fillStyle = '#0f172a';
  ctx.font = `bold 52px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  ctx.direction = 'ltr';
  ctx.fillText(formatCertificateCode(cert.code), cx, 1250);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png')
  );
}
