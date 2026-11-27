import { useEffect, useMemo } from 'react';
import { Trophy, Share2, Award } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { useBackButton } from '@/hooks/useBackButton';
import { buildCourseDeepLink } from '@/lib/deepLink';
import { openTelegramLink } from '@/lib/telegram';

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#14b8a6'];

/** Lightweight CSS confetti; hidden for users who prefer reduced motion. */
function Confetti() {
  // Fixed per mount so pieces don't jump on re-render.
  const pieces = useMemo(
    () =>
      Array.from({ length: 36 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.2 + Math.random() * 1.6,
        size: 6 + Math.random() * 6,
        color: COLORS[i % COLORS.length],
        round: i % 3 === 0,
      })),
    []
  );
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden motion-reduce:hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute -top-4 animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            background: p.color,
            borderRadius: p.round ? '9999px' : '2px',
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Shown once when a student completes the last lesson of a course. */
export function CourseCompleteDialog({
  courseId,
  courseTitle,
  lessonCount,
  onClose,
  onBackToCourse,
  onGetCertificate,
}: {
  courseId: string;
  courseTitle: string;
  lessonCount: number;
  onClose: () => void;
  onBackToCourse: () => void;
  /** Shown as the main action when given. */
  onGetCertificate?: () => void;
}) {
  const { t } = useI18n();
  useBackButton(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const share = () => {
    const text = t('complete.shareText', { course: courseTitle });
    const url = buildCourseDeepLink(courseId);
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-labelledby="complete-title">
      <button className="absolute inset-0 bg-black/50" aria-label={t('common.close')} onClick={onClose} />
      <Confetti />
      <div className="relative w-full max-w-sm rounded-3xl bg-surface p-6 text-center shadow-2xl motion-safe:animate-pop-in">
        <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 flex items-center justify-center shadow-lg">
          <Trophy className="h-10 w-10 text-white" />
        </div>
        <h2 id="complete-title" className="mt-5 text-2xl font-bold text-slate-900">{t('complete.title')}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t('complete.bodyBefore')} <bdi className="font-semibold text-slate-900">«{courseTitle}»</bdi> {t('complete.bodyAfter')}
        </p>
        <p className="mt-1 text-xs text-slate-400">{t('complete.lessons', { n: lessonCount })}</p>

        {onGetCertificate && (
          <button
            onClick={onGetCertificate}
            className="mt-6 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-[#0B2463] text-sm font-semibold active:scale-[0.98] transition-all"
          >
            <Award className="h-4 w-4" />
            {t('complete.getCertificate')}
          </button>
        )}
        <button
          onClick={share}
          className={`${onGetCertificate ? 'mt-2' : 'mt-6'} w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold active:scale-[0.98] transition-all`}
        >
          <Share2 className="h-4 w-4" />
          {t('complete.share')}
        </button>
        <button
          onClick={onBackToCourse}
          className="mt-2 w-full py-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-[0.98] transition-all"
        >
          {t('complete.backToCourse')}
        </button>
      </div>
    </div>
  );
}
