import { useCallback, useEffect, useState } from 'react';
import { Award, Send, Share2, CheckCircle2, AlertCircle, MessageCircle } from 'lucide-react';
import { Card } from '@/components/Card';
import { AppHeader } from '@/components/AppHeader';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { useUser } from '@/hooks/useUser';
import { useI18n, type TKey } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { hapticFeedback, openTelegramLink, requestBotWriteAccess } from '@/lib/telegram';
import { buildBotChatLink, buildCertificateVerifyLink } from '@/lib/deepLink';
import { fetchCourseById } from '@/lib/courseService';
import {
  fetchMyCertificate, issueCertificate, renderCertificate, sendCertificateToChat, classifyIssueError,
  formatCertificateCode, type Certificate, type IssueError,
} from '@/lib/certificateService';
import type { Course } from '@/lib/types';

const issueErrorKeys: Record<IssueError, TKey> = {
  lessons: 'cert.err.lessons',
  quizzes: 'cert.err.quizzes',
  name: 'cert.err.name',
  enroll: 'cert.err.enroll',
  other: 'cert.err.other',
};

type SendState = 'idle' | 'sending' | 'sent' | 'needs_access' | 'failed';

export function CertificateScreen({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const { user } = useUser();
  const { t, lang } = useI18n();
  const [course, setCourse] = useState<Course | null>(null);
  const [cert, setCert] = useState<Certificate | null>(null);
  const [name, setName] = useState('');
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<IssueError | null>(null);
  const [send, setSend] = useState<SendState>('idle');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const [c, existing] = await Promise.all([fetchCourseById(courseId), fetchMyCertificate(user.id, courseId)]);
      setCourse(c);
      setCert(existing);
      setName(user.first_name);
    } catch (err) {
      setError(errorMessage(err, t('cert.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [user, courseId, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Draw the image whenever there is a certificate (or the language changes).
  useEffect(() => {
    if (!cert) return;
    let url: string | null = null;
    let cancelled = false;
    renderCertificate(cert, lang)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
      })
      .catch(() => setImage(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [cert, lang]);

  const handleIssue = async () => {
    try {
      setIssuing(true);
      setIssueError(null);
      const issued = await issueCertificate(courseId, name);
      setCert(issued);
      hapticFeedback('success');
    } catch (err) {
      setIssueError(classifyIssueError(errorMessage(err, '')));
      hapticFeedback('error');
    } finally {
      setIssuing(false);
    }
  };

  const handleSend = async () => {
    if (!cert || !image) return;
    setSend('sending');
    let result = await sendCertificateToChat(cert.id, image.blob);
    if (result === 'chat_unavailable' && (await requestBotWriteAccess())) {
      result = await sendCertificateToChat(cert.id, image.blob);
    }
    setSend(result === 'sent' ? 'sent' : result === 'chat_unavailable' ? 'needs_access' : 'failed');
    hapticFeedback(result === 'sent' ? 'success' : 'error');
  };

  const handleShare = () => {
    if (!cert) return;
    const text = t('cert.shareText', { course: cert.course_title, code: formatCertificateCode(cert.code) });
    const url = buildCertificateVerifyLink(cert.code);
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  };

  if (loading) return (
    <>
      <AppHeader title={t('cert.title')} onBack={onBack} />
      <LoadingScreen />
    </>
  );
  if (error) return (
    <>
      <AppHeader title={t('cert.title')} onBack={onBack} />
      <ErrorState message={error} onRetry={load} />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader title={t('cert.title')} onBack={onBack} />
      <div className="px-4 py-5 space-y-4 pb-16">
        {!cert ? (
          // Not issued yet: confirm the name (it can't change afterwards).
          <Card className="p-5">
            <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center">
              <Award className="h-8 w-8 text-white" />
            </div>
            <h1 className="mt-4 text-center text-lg font-bold text-slate-900">{t('cert.issueTitle')}</h1>
            <p className="mt-1 text-center text-sm text-slate-500">
              <bdi className="font-semibold text-slate-700">{course?.title}</bdi>
            </p>
            <label htmlFor="cert-name" className="mt-5 block text-sm font-medium text-slate-700 mb-1.5">{t('cert.nameLabel')}</label>
            <input
              id="cert-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              dir="auto"
              className="w-full px-3.5 py-3 rounded-xl border border-slate-200 bg-surface text-base text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <p className="mt-1.5 text-xs text-slate-400">{t('cert.nameHint')}</p>
            {issueError && (
              <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {t(issueErrorKeys[issueError])}
              </p>
            )}
            <button
              onClick={handleIssue}
              disabled={issuing || name.trim().length < 2}
              className="mt-5 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-amber-500 text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              <Award className="h-4 w-4" />
              {issuing ? t('cert.issuing') : t('cert.issue')}
            </button>
          </Card>
        ) : (
          <>
            <Card className="p-2 overflow-hidden">
              {image ? (
                <img src={image.url} alt={t('cert.title')} className="w-full rounded-xl" />
              ) : (
                <div className="w-full aspect-[2000/1414] rounded-xl bg-slate-100 animate-pulse" />
              )}
            </Card>

            <Card className="p-4">
              <p className="text-xs text-slate-500">{t('cert.code')}</p>
              <p dir="ltr" className="mt-0.5 font-mono text-lg font-bold text-slate-900 text-start">{formatCertificateCode(cert.code)}</p>
              <p className="mt-2 text-xs text-slate-500">{t('cert.codeHint')}</p>
            </Card>

            <button
              onClick={handleSend}
              disabled={!image || send === 'sending'}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-500 text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] transition-all"
            >
              <Send className="h-4 w-4 rtl:-scale-x-100" />
              {send === 'sending' ? t('lessonMedia.sending') : t('cert.send')}
            </button>
            {send === 'sent' && (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-green-50 px-3 py-2.5">
                <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> {t('cert.sent')}
                </span>
                <button onClick={() => openTelegramLink(buildBotChatLink())} className="flex items-center gap-1 text-xs font-semibold text-green-700">
                  <MessageCircle className="h-3.5 w-3.5" /> {t('lessonMedia.openChat')}
                </button>
              </div>
            )}
            {(send === 'needs_access' || send === 'failed') && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
                {send === 'needs_access' ? t('lessonMedia.needsAccess') : t('cert.sendFailed')}
              </p>
            )}
            <button
              onClick={handleShare}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-slate-200 bg-surface text-slate-700 text-sm font-semibold active:scale-[0.98] transition-all"
            >
              <Share2 className="h-4 w-4" />
              {t('cert.share')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
