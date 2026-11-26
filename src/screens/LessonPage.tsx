import { useEffect, useState, useCallback } from 'react';
import { Check, ChevronLeft, ChevronRight, FileText as FileIcon, Link as LinkIcon, Download, Send, CheckCircle2, ExternalLink } from 'lucide-react';
import { Card } from '@/components/Card';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { AppHeader } from '@/components/AppHeader';
import { LessonMedia } from '@/components/LessonMedia';
import { LinkifiedText } from '@/components/LinkifiedText';
import { useUser } from '@/hooks/useUser';
import {
  fetchCourseById,
  fetchModulesWithLessons,
  fetchLessonProgress,
  fetchResourcesByLesson,
  markLessonComplete,
  updateLastLesson,
  getAllLessonsOrdered,
} from '@/lib/courseService';
import { openTelegramLink, openExternalLink, hapticFeedback } from '@/lib/telegram';
import { useI18n, type TKey } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import type { Course, Lesson, Resource, ModuleWithLessons } from '@/lib/types';

const resourceIcons: Record<string, typeof FileIcon> = {
  pdf: FileIcon,
  file: Download,
  link: LinkIcon,
  telegram: Send,
};

const resourceLabelKeys: Record<string, TKey> = {
  pdf: 'resource.pdf',
  file: 'resource.file',
  link: 'resource.link',
  telegram: 'resource.telegram',
};

export function LessonPage({
  courseId,
  lessonId,
  onBack,
  onNavigateLesson,
}: {
  courseId: string;
  onBack: () => void;
  onNavigateLesson: (courseId: string, lessonId: string) => void;
  lessonId: string;
}) {
  const { user } = useUser();
  const { t } = useI18n();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<ModuleWithLessons[]>([]);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const c = await fetchCourseById(courseId);
      if (!c) {
        setError(t('common.courseNotFound'));
        setLoading(false);
        return;
      }
      setCourse(c);

      const [mods, lp, res] = await Promise.all([
        fetchModulesWithLessons(courseId),
        fetchLessonProgress(user.id, courseId),
        fetchResourcesByLesson(lessonId),
      ]);

      setModules(mods);
      setResources(res);

      const allLessons = getAllLessonsOrdered(mods);
      const lesson = allLessons.find((l) => l.id === lessonId);
      if (!lesson) {
        setError(t('lesson.notFound'));
        setLoading(false);
        return;
      }
      setCurrentLesson(lesson);

      const progressEntry = lp.find((p) => p.lesson_id === lessonId);
      setCompleted(progressEntry?.completed ?? false);

      await updateLastLesson(user.id, courseId, lessonId);
    } catch (err) {
      setError(errorMessage(err, t('lesson.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [user, courseId, lessonId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const allLessons = getAllLessonsOrdered(modules);
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex >= 0 && currentIndex < allLessons.length - 1 ? allLessons[currentIndex + 1] : null;

  const handleMarkComplete = async () => {
    if (!user || completed || marking) return;
    try {
      setMarking(true);
      setActionError(null);
      await markLessonComplete(user.id, courseId, lessonId);
      setCompleted(true);
      setShowSuccess(true);
      hapticFeedback('success');
      setTimeout(() => setShowSuccess(false), 2500);
    } catch (err) {
      // Keep the lesson on screen; a failed save shouldn't throw the learner out of it.
      setActionError(errorMessage(err, t('lesson.markFailed')));
    } finally {
      setMarking(false);
    }
  };

  const handleResourceClick = (resource: Resource) => {
    if (resource.type === 'telegram') {
      openTelegramLink(resource.url);
    } else {
      openExternalLink(resource.url);
    }
  };

  const handleNavigate = (targetLessonId: string) => {
    onNavigateLesson(courseId, targetLessonId);
  };

  if (loading) return (
    <>
      <AppHeader title={t('lesson.title')} onBack={onBack} />
      <LoadingScreen message={t('lesson.loading')} />
    </>
  );

  if (error) return (
    <>
      <AppHeader title={t('lesson.title')} onBack={onBack} />
      <ErrorState message={error} onRetry={load} />
    </>
  );

  if (!currentLesson) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader title={course?.title ?? t('lesson.title')} onBack={onBack} />

      <div className="px-4 py-5 space-y-5 pb-28">
        {/* Lesson title */}
        <div>
          <h1 dir="auto" className="text-2xl font-bold text-slate-900 text-left rtl:text-right">{currentLesson.title}</h1>
          {currentLesson.description && (
            <p dir="auto" className="text-sm text-slate-500 mt-2 text-start">
              <LinkifiedText text={currentLesson.description} />
            </p>
          )}
        </div>

        {/* Attached Telegram file (image inline, other files sent to the chat) */}
        <LessonMedia key={currentLesson.id} lesson={currentLesson} protect={course?.protect_content !== false} />

        {/* Telegram content link */}
        {currentLesson.telegram_url && (
          <Card className="p-4 bg-blue-50 border-blue-200">
            <button
              onClick={() => openTelegramLink(currentLesson.telegram_url!)}
              className="flex items-center gap-3 w-full text-start"
            >
              <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
                <Send className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-blue-900">{t('lesson.viewOnTelegram')}</p>
                <p className="text-xs text-blue-600 mt-0.5">{t('lesson.openOriginal')}</p>
              </div>
              <ExternalLink className="h-5 w-5 text-blue-500" />
            </button>
          </Card>
        )}

        {/* Lesson content */}
        {currentLesson.content && (
          <Card className="p-5">
            <div className="prose prose-sm max-w-none">
              {currentLesson.content.split('\n').map((line, i) => {
                if (line.trim() === '') return <div key={i} className="h-3" />;
                if (line.startsWith('- ') || line.startsWith('  ')) {
                  return (
                    <p key={i} dir="auto" className="text-slate-700 text-sm leading-relaxed ps-3 text-start">
                      <LinkifiedText text={line} />
                    </p>
                  );
                }
                return (
                  <p key={i} dir="auto" className="text-slate-700 text-sm leading-relaxed text-start">
                    <LinkifiedText text={line} />
                  </p>
                );
              })}
            </div>
          </Card>
        )}

        {/* Resources */}
        {resources.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
              {t('lesson.resources')}
            </h2>
            <div className="space-y-2">
              {resources.map((resource) => {
                const Icon = resourceIcons[resource.type] ?? FileIcon;
                return (
                  <Card key={resource.id} className="p-3" onClick={() => handleResourceClick(resource)}>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-5 w-5 text-slate-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p dir="auto" className="text-sm font-medium text-slate-900 truncate text-left rtl:text-right">{resource.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-medium text-slate-400 uppercase">{t(resourceLabelKeys[resource.type] ?? 'resource.link')}</span>
                          {resource.description && (
                            <span className="text-xs text-slate-400 truncate">— {resource.description}</span>
                          )}
                        </div>
                      </div>
                      <ExternalLink className="h-4 w-4 text-slate-300 flex-shrink-0" />
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => prevLesson && handleNavigate(prevLesson.id)}
            disabled={!prevLesson}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-slate-50 enabled:active:scale-95 transition-all"
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            {t('lesson.prev')}
          </button>
          <button
            onClick={() => nextLesson && handleNavigate(nextLesson.id)}
            disabled={!nextLesson}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-slate-50 enabled:active:scale-95 transition-all"
          >
            {t('lesson.next')}
            <ChevronRight className="h-4 w-4 rtl:rotate-180" />
          </button>
        </div>
      </div>

      {/* Complete button — fixed bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-surface/90 backdrop-blur-md border-t border-slate-200/60 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="max-w-lg mx-auto">
          {actionError && (
            <div role="alert" className="mb-2 text-center text-sm text-red-600">
              {actionError}
            </div>
          )}
          {showSuccess && (
            <div className="mb-2 flex items-center justify-center gap-1.5 text-green-600 text-sm font-medium animate-pulse">
              <CheckCircle2 className="h-4 w-4" />
              {nextLesson ? t('lesson.completedNext') : t('lesson.completedDone')}
            </div>
          )}
          <button
            onClick={handleMarkComplete}
            disabled={completed || marking}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm transition-all ${
              completed
                ? 'bg-green-50 text-green-600 border border-green-200'
                : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-[0.98] shadow-sm'
            }`}
          >
            {completed ? (
              <>
                <Check className="h-5 w-5" strokeWidth={3} />
                {t('lesson.completed')}
              </>
            ) : marking ? (
              <>
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('lesson.saving')}
              </>
            ) : (
              <>
                <Check className="h-5 w-5" />
                {t('lesson.markComplete')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
