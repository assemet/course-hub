import { useEffect, useState, useCallback } from 'react';
import { Check, ChevronLeft, ChevronRight, FileText as FileIcon, Link as LinkIcon, Download, Send, CheckCircle2, ExternalLink, ListOrdered, ClipboardList, Lock } from 'lucide-react';
import { Card } from '@/components/Card';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { AppHeader } from '@/components/AppHeader';
import { LessonMedia } from '@/components/LessonMedia';
import { LessonThumb } from '@/components/LessonThumb';
import { LinkifiedText } from '@/components/LinkifiedText';
import { LessonListSheet } from '@/components/LessonListSheet';
import { CourseCompleteDialog } from '@/components/CourseCompleteDialog';
import { fetchCourseQuizStatus, hasQuiz, lockedModuleIds, type QuizStatus } from '@/lib/quizService';
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
  onOpenQuiz,
  onOpenCertificate,
}: {
  courseId: string;
  onBack: () => void;
  onNavigateLesson: (courseId: string, lessonId: string) => void;
  onOpenQuiz: (courseId: string, moduleId: string) => void;
  onOpenCertificate: (courseId: string) => void;
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
  const [quizStatus, setQuizStatus] = useState<Map<string, QuizStatus>>(new Map());

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

      const [mods, lp, res, quizzes] = await Promise.all([
        fetchModulesWithLessons(courseId),
        fetchLessonProgress(user.id, courseId),
        fetchResourcesByLesson(lessonId),
        fetchCourseQuizStatus(courseId).catch(() => new Map<string, QuizStatus>()),
      ]);
      setQuizStatus(quizzes);

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
  const locked = lockedModuleIds(modules, quizStatus, !!course?.quiz_gating);
  const isLocked = !!currentModule && locked.has(currentModule.id);
  // The quiz that stands between the learner and what comes next, if any.
  const currentQuiz = currentModule ? quizStatus.get(currentModule.id) : undefined;
  const isLastInModule = !!currentModule && currentModule.lessons[currentModule.lessons.length - 1]?.id === lessonId;
  const quizIsNext = !!currentModule && isLastInModule && hasQuiz(currentQuiz) && !currentQuiz.passed;
  const allQuizzesPassed = [...quizStatus.values()].every((s) => !hasQuiz(s) || s.passed);
  // First module (in order) whose quiz is still open: the blocker when gating is on.
  const blockingQuizModule = modules.find((m) => {
    const st = quizStatus.get(m.id);
    return hasQuiz(st) && !st.passed;
  }) ?? null;

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
      // This was the last unfinished lesson and every quiz is passed: celebrate the course.
      if (allLessons.length > 0 && allLessons.every((l) => done.has(l.id)) && allQuizzesPassed) {
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

  // Gated module: say why it's closed and lead to the quiz that opens it.
  if (isLocked) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AppHeader title={course?.title ?? t('lesson.title')} onBack={onBack} />
        <div className="px-6 py-16 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Lock className="h-8 w-8 text-slate-400" />
          </div>
          <h1 className="mt-4 text-lg font-bold text-slate-900">{t('lesson.lockedTitle')}</h1>
          <p className="mt-2 text-sm text-slate-500">{t('lesson.lockedBody')}</p>
          {blockingQuizModule && (
            <button
              onClick={() => onOpenQuiz(courseId, blockingQuizModule.id)}
              className="mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-amber-500 text-[#0B2463] text-sm font-semibold active:scale-[0.98] transition-all min-w-0"
            >
              <ClipboardList className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{t('course.takeQuiz')} <bdi>{blockingQuizModule.title}</bdi></span>
            </button>
          )}
        </div>
      </div>
    );
  }

  type NextAction =
    | { kind: 'lesson'; lesson: Lesson }
    | { kind: 'quiz'; moduleId: string }
    | { kind: 'certificate' };
  const nextAction: NextAction | null = (() => {
    if (!completed) return null;
    if (quizIsNext && currentModule) return { kind: 'quiz', moduleId: currentModule.id };
    if (nextLesson) {
      const nextModule = modules.find((m) => m.lessons.some((l) => l.id === nextLesson.id));
      if (nextModule && locked.has(nextModule.id) && blockingQuizModule) {
        return { kind: 'quiz', moduleId: blockingQuizModule.id };
      }
      return { kind: 'lesson', lesson: nextLesson };
    }
    const allDone = allLessons.length > 0 && allLessons.every((l) => completedSet.has(l.id));
    if (allDone && blockingQuizModule) return { kind: 'quiz', moduleId: blockingQuizModule.id };
    if (allDone) return { kind: 'certificate' };
    return null;
  })();

  // A lesson that is only a file: no written text to read on the page.
  const mediaType = currentLesson.media_file_id ? currentLesson.media_type : null;
  const fileOnly = !!mediaType && mediaType !== 'image' && !currentLesson.content?.trim();
  const isCreator = !!course && course.creator_id === user?.id;
  const guideSteps = [
    t(mediaType === 'video' ? 'lesson.guide.video1' : mediaType === 'audio' ? 'lesson.guide.audio1' : 'lesson.guide.file1'),
    t(mediaType === 'video' ? 'lesson.guide.video2' : mediaType === 'audio' ? 'lesson.guide.audio2' : 'lesson.guide.file2'),
    t('lesson.guide.done', { button: t('lesson.markComplete') }),
  ];

  return (
    <div className="min-h-screen bg-surface">
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

      <div className="px-5 py-5 space-y-5 pb-28">
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
          <h1 dir="auto" className="text-[26px] font-bold leading-snug text-slate-900 text-left rtl:text-right">{currentLesson.title}</h1>
          {currentLesson.description && (
            <p dir="auto" className="text-[15px] leading-relaxed text-slate-500 mt-2 text-start">
              <LinkifiedText text={currentLesson.description} />
            </p>
          )}
        </div>

        {/* Attached Telegram file (image inline, other files sent to the chat) */}
        <LessonMedia
          key={currentLesson.id}
          lesson={currentLesson}
          protect={course?.protect_content !== false}
          // The guide below explains the same steps when the lesson is only a file.
          showHint={!fileOnly}
        />

        {/* A lesson that is only a file (most imports): say how to study it, and what comes next. */}
        {fileOnly && (
          <section aria-labelledby="lesson-guide" className="rounded-2xl bg-slate-50 p-4">
            <h2 id="lesson-guide" className="text-sm font-bold text-slate-900">{t('lesson.guide.title')}</h2>
            <ol className="mt-3 space-y-3">
              {guideSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="h-6 w-6 rounded-full bg-surface text-blue-600 text-xs font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed text-slate-700 pt-0.5">{step}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
        {fileOnly && isCreator && (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">{t('lesson.creatorHint')}</p>
        )}
        {fileOnly && nextLesson && !isLocked && (
          <button
            onClick={() => handleNavigate(nextLesson.id)}
            className="w-full flex items-center gap-3 rounded-2xl border border-slate-200 p-3 text-start active:scale-[0.99] transition-transform"
          >
            <LessonThumb lesson={nextLesson} courseId={courseId} className="h-12 w-[68px] rounded-xl" withDuration />
            <span className="flex-1 min-w-0">
              <span className="block text-xs text-slate-500">{t('lesson.upNext')}</span>
              <span dir="auto" className="block text-sm font-semibold text-slate-900 truncate text-start">{nextLesson.title}</span>
            </span>
            <ChevronLeft className="h-4 w-4 text-slate-400 flex-shrink-0 ltr:rotate-180" />
          </button>
        )}

        {/* Telegram content link */}
        {currentLesson.telegram_url && (
          <Card className="p-4 bg-blue-50">
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
          <div className="max-w-prose">
            <div>
              {currentLesson.content.split('\n').map((line, i) => {
                if (line.trim() === '') return <div key={i} className="h-3" />;
                if (line.startsWith('- ') || line.startsWith('  ')) {
                  return (
                    <p key={i} dir="auto" className="text-slate-800 text-[17px] leading-[1.85] ps-3 text-start">
                      <LinkifiedText text={line} />
                    </p>
                  );
                }
                return (
                  <p key={i} dir="auto" className="text-slate-800 text-[17px] leading-[1.85] text-start">
                    <LinkifiedText text={line} />
                  </p>
                );
              })}
            </div>
          </div>
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
                  <Card key={resource.id} className="p-3 bg-slate-50 shadow-none" onClick={() => handleResourceClick(resource)}>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-surface flex items-center justify-center flex-shrink-0">
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

        {/* Previous / next: quiet, the bottom bar holds the main action. */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => prevLesson && handleNavigate(prevLesson.id)}
            disabled={!prevLesson}
            className="flex items-center gap-1 h-11 px-2 -mx-2 rounded-xl text-slate-500 text-sm font-medium disabled:invisible enabled:active:bg-slate-100 transition-colors"
          >
            <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
            {t('lesson.prev')}
          </button>
          <button
            onClick={() => nextLesson && handleNavigate(nextLesson.id)}
            disabled={!nextLesson}
            className="flex items-center gap-1 h-11 px-2 -mx-2 rounded-xl text-slate-500 text-sm font-medium disabled:invisible enabled:active:bg-slate-100 transition-colors"
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
          {nextAction ? (
            // Done here: offer the natural next step.
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 px-3 py-3.5 rounded-2xl bg-green-50 text-green-600 border border-green-200 text-sm font-semibold flex-shrink-0">
                <Check className="h-4 w-4" strokeWidth={3} />
                {t('lesson.completed')}
              </span>
              {nextAction.kind === 'lesson' && (
                <button
                  onClick={() => handleNavigate(nextAction.lesson.id)}
                  className="flex-1 min-w-0 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 active:scale-[0.98] shadow-sm transition-all"
                >
                  <span className="truncate">
                    {t('lesson.nextPrefix')} <bdi>{nextAction.lesson.title}</bdi>
                  </span>
                  <ChevronRight className="h-4 w-4 flex-shrink-0 rtl:rotate-180" />
                </button>
              )}
              {nextAction.kind === 'quiz' && (
                <button
                  onClick={() => onOpenQuiz(courseId, nextAction.moduleId)}
                  className="flex-1 min-w-0 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-amber-500 text-[#0B2463] text-sm font-semibold active:scale-[0.98] shadow-sm transition-all"
                >
                  <ClipboardList className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{t('quiz.takeModuleQuiz')}</span>
                </button>
              )}
              {nextAction.kind === 'certificate' && (
                <button
                  onClick={() => onOpenCertificate(courseId)}
                  className="flex-1 min-w-0 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-amber-500 text-[#0B2463] text-sm font-semibold active:scale-[0.98] shadow-sm transition-all"
                >
                  <span className="truncate">{t('complete.getCertificate')}</span>
                </button>
              )}
            </div>
          ) : (
          <button
            onClick={handleMarkComplete}
            disabled={completed || marking}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm transition-all ${
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
          lockedModuleIds={locked}
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
          onGetCertificate={() => {
            setShowCourseComplete(false);
            onOpenCertificate(courseId);
          }}
        />
      )}
    </div>
  );
}
