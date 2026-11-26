import { useEffect, useRef } from 'react';
import { Check, X, Lock } from 'lucide-react';
import { useI18n, type TKey } from '@/lib/i18n';
import { useBackButton } from '@/hooks/useBackButton';
import { formatDuration } from '@/lib/mediaService';
import type { LessonMediaType, ModuleWithLessons } from '@/lib/types';

const mediaLabelKeys: Record<LessonMediaType, TKey> = {
  video: 'media.video',
  pdf: 'media.pdf',
  audio: 'media.audio',
  image: 'media.image',
  file: 'media.file',
};

/**
 * Bottom sheet with every lesson of the course, so a student can jump to any
 * lesson without going back to the course page.
 */
export function LessonListSheet({
  modules,
  completedSet,
  currentLessonId,
  lockedModuleIds,
  onSelect,
  onClose,
}: {
  modules: ModuleWithLessons[];
  completedSet: Set<string>;
  currentLessonId: string;
  /** Modules closed by quiz gating: shown with a lock, not selectable. */
  lockedModuleIds?: Set<string>;
  onSelect: (lessonId: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const currentRef = useRef<HTMLButtonElement>(null);

  // Telegram's back button and Escape close the sheet first.
  useBackButton(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Open with the current lesson in view.
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  const total = modules.reduce((n, m) => n + m.lessons.length, 0);
  const done = modules.reduce((n, m) => n + m.lessons.filter((l) => completedSet.has(l.id)).length, 0);
  let number = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="lesson-list-title">
      <button className="absolute inset-0 bg-black/40" aria-label={t('common.close')} onClick={onClose} />
      <div className="relative w-full max-w-lg max-h-[80vh] flex flex-col rounded-t-3xl bg-surface shadow-xl motion-safe:animate-sheet-up">
        <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
          <div className="flex-1">
            <h2 id="lesson-list-title" className="text-base font-bold text-slate-900">{t('lesson.list.title')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('lesson.list.progress', { done, total })}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+12px)]">
          {modules.map((m) => (
            <div key={m.id}>
              <p dir="auto" className="px-5 pt-4 pb-1.5 text-xs font-semibold text-slate-400 text-start">{m.title}</p>
              {m.lessons.map((l) => {
                number++;
                const isCurrent = l.id === currentLessonId;
                const isDone = completedSet.has(l.id);
                const isLocked = !!lockedModuleIds?.has(m.id);
                const duration = l.media_type === 'video' || l.media_type === 'audio' ? formatDuration(l.media_duration) : null;
                return (
                  <button
                    key={l.id}
                    ref={isCurrent ? currentRef : undefined}
                    onClick={() => (isCurrent ? onClose() : onSelect(l.id))}
                    disabled={isLocked}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={`w-full flex items-center gap-3 px-5 py-3 text-start transition-colors disabled:opacity-50 ${
                      isCurrent ? 'bg-blue-50' : 'enabled:hover:bg-slate-50 enabled:active:bg-slate-100'
                    }`}
                  >
                    {isLocked ? (
                      <span className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Lock className="h-3.5 w-3.5 text-slate-400" />
                      </span>
                    ) : isDone ? (
                      <span className="h-7 w-7 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                        <Check className="h-4 w-4 text-white" strokeWidth={3} />
                      </span>
                    ) : (
                      <span
                        className={`h-7 w-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 text-xs font-semibold ${
                          isCurrent ? 'border-blue-500 text-blue-600' : 'border-slate-300 text-slate-400'
                        }`}
                      >
                        {number}
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span
                        dir="auto"
                        className={`block text-sm truncate text-left rtl:text-right ${
                          isCurrent ? 'font-semibold text-blue-700' : 'font-medium text-slate-800'
                        }`}
                      >
                        {l.title}
                      </span>
                      {l.media_type && (
                        <span className="block text-[11px] text-slate-400 mt-0.5">
                          {t(mediaLabelKeys[l.media_type])}
                          {duration && <> · <bdi>{duration}</bdi></>}
                        </span>
                      )}
                    </span>
                    {isCurrent && (
                      <span className="flex-shrink-0 text-[10px] font-bold text-blue-600 bg-surface border border-blue-200 rounded-full px-2 py-0.5">
                        {t('lesson.list.current')}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
