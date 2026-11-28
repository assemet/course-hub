import { supabase } from './supabase';
import { getTelegramInitData } from './telegram';
import type { Lang } from './i18n';
import { buildCertificateVerifyLink } from './deepLink';
import { renderCertificateImage, type CertificateDesign } from './certificateRender';

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
  form.append('image', image, 'certificate.jpg');
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

/** Draws the certificate (2000x1414 PNG) in the course's design. Text comes from the issued record. */
export function renderCertificate(cert: Certificate, lang: Lang, design: CertificateDesign): Promise<Blob> {
  return renderCertificateImage(
    {
      studentName: cert.student_name,
      courseTitle: cert.course_title,
      creatorName: cert.creator_name,
      lessonCount: cert.lesson_count,
      issuedAt: cert.issued_at,
      code: formatCertificateCode(cert.code),
      verifyUrl: buildCertificateVerifyLink(cert.code),
    },
    design,
    lang
  );
}
