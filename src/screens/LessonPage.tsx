import { useEffect, useState, useCallback } from 'react';
import { Check, ChevronLeft, ChevronRight, FileText as FileIcon, Link as LinkIcon, Download, Send, CheckCircle2, ExternalLink, ListOrdered } from 'lucide-react';
import { Card } from '@/components/Card';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { AppHeader } from '@/components/AppHeader';
import { LessonMedia } from '@/components/LessonMedia';
import { LinkifiedText } from '@/components/LinkifiedText';
import { LessonListSheet } from '@/components/LessonListSheet';
import { CourseCompleteDialog } from '@/components/CourseCompleteDialog';
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
  const [completedSet, setCompletedSet] = useState<Set<string>>(new Set());
  const [showList, setShowList] = useState(false);
  const [showCourseComplete, setShowCourseComplete] = useState(false);

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

      const done = new Set(lp.filter((p) => p.completed).map((p) => p.lesson_id));
      setCompletedSet(done);
      setCompleted(done.has(lessonId));

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
  const currentModule = modules.find((m) => m.lessons.some((l) => l.id === lessonId)) ?? null;

  const handleMarkComplete = async () => {
    if (!user || completed || marking) return;
    try {
      setMarking(true);
      setActionError(null);
      await markLessonComplete(user.id, courseId, lessonId);
      setCompleted(true);
      const done = new Set(completedSet).add(lessonId);
      setCompletedSet(done);
      hapticFeedback('success');
      // This was the last unfinished lesson: celebrate the whole course.
      if (allLessons.length > 0 && allLessons.every((l) => done.has(l.id))) {
        setShowCourseComplete(true);
      } else {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2500);
      }
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
      <AppHeader
        title={course?.title ?? t('lesson.title')}
        onBack={onBack}
        rightAction={
          <button
            onClick={() => setShowList(true)}
            aria-label={t('lesson.openList')}
            className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 active:scale-90 transition-all"
          >
            <ListOrdered className="h-5 w-5 text-slate-600" />
          </button>
        }
      />

      <div className="px-4 py-5 space-y-5 pb-28">
        {/* Lesson title */}
        <div>
          {currentIndex >= 0 && (
            <button
              onClick={() => setShowList(true)}
              className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-blue-600 max-w-full"
            >
              <span className="flex-shrink-0">{t('lesson.position', { n: currentIndex + 1, total: allLessons.length })}</span>
              {currentModule && (
                <>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span dir="auto" className="truncate text-slate-500">{currentModule.title}</span>
                </>
              )}
            </button>
          )}
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
          {completed && nextLesson ? (
            // Done here: the natural next step is the next lesson.
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 px-3 py-3.5 rounded-xl bg-green-50 text-green-600 border border-green-200 text-sm font-semibold flex-shrink-0">
                <Check className="h-4 w-4" strokeWidth={3} />
                {t('lesson.completed')}
              </span>
              <button
                onClick={() => handleNavigate(nextLesson.id)}
                className="flex-1 min-w-0 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 active:scale-[0.98] shadow-sm transition-all"
              >
                <span className="truncate">
                  {t('lesson.nextPrefix')} <bdi>{nextLesson.title}</bdi>
                </span>
                <ChevronRight className="h-4 w-4 flex-shrink-0 rtl:rotate-180" />
              </button>
            </div>
          ) : (
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
          )}
        </div>
      </div>

      {showList && (
        <LessonListSheet
          modules={modules}
          completedSet={completedSet}
          currentLessonId={lessonId}
          onClose={() => setShowList(false)}
          onSelect={(id) => {
            setShowList(false);
            handleNavigate(id);
          }}
        />
      )}

      {showCourseComplete && course && (
        <CourseCompleteDialog
          courseId={course.id}
          courseTitle={course.title}
          lessonCount={allLessons.length}
          onClose={() => setShowCourseComplete(false)}
          onBackToCourse={() => {
            setShowCourseComplete(false);
            onBack();
          }}
        />
      )}
    </div>
  );
}
