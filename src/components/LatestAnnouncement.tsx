import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { LinkifiedText } from '@/components/LinkifiedText';
import { fetchAnnouncements, type CourseAnnouncement } from '@/lib/questionService';

/** Older announcements stop showing on the course page. */
const SHOW_FOR_DAYS = 14;

/** The course's most recent announcement, on the course page, while it is fresh. */
export function LatestAnnouncement({ courseId }: { courseId: string }) {
  const { t, formatRelative } = useI18n();
  const [latest, setLatest] = useState<CourseAnnouncement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAnnouncements(courseId, 1)
      .then(([a]) => {
        if (cancelled || !a) return;
        const fresh = Date.now() - new Date(a.created_at).getTime() < SHOW_FOR_DAYS * 86_400_000;
        setLatest(fresh ? a : null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  if (!latest) return null;

  return (
    <aside aria-label={t('announce.latest')} className="flex items-start gap-3 rounded-[20px] bg-amber-50 p-4">
      <div className="h-9 w-9 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
        <Megaphone className="h-[18px] w-[18px] text-[#0B2463]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-amber-900">
          {t('announce.latest')} · <span className="font-normal">{formatRelative(latest.created_at)}</span>
        </p>
        <p dir="auto" className="mt-1 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap break-words text-start">
          <LinkifiedText text={latest.body} />
        </p>
      </div>
    </aside>
  );
}
