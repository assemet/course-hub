import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, Check, BookOpen, FileText, Link as LinkIcon, Share2, Copy, Check as CheckIcon, Play, Trophy, Lock, ClipboardList, Award } from 'lucide-react';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { AppHeader } from '@/components/AppHeader';
import { useUser } from '@/hooks/useUser';
import {
  fetchCourseById,
  fetchModulesWithLessons,
  fetchLessonProgress,
  fetchEnrollment,
  createEnrollment,
  calculateProgress,
  updateLastLesson,
  fetchCreatorName,
  getLessonState,
  getAllLessonsOrdered,
  pickNextLesson,
} from '@/lib/courseService';
import type { Course, ModuleWithLessons, LessonProgress, Enrollment, Lesson } from '@/lib/types';
import { buildCourseDeepLink } from '@/lib/deepLink';
import { useI18n, type TKey } from '@/lib/i18n';
import { MediaThumb } from '@/components/MediaThumb';
import { fetchCourseQuizStatus, hasQuiz, lockedModuleIds, type QuizStatus } from '@/lib/quizService';
import { formatDuration } from '@/lib/mediaService';
import type { LessonMediaType } from '@/lib/types';

const mediaLabelKeys: Record<LessonMediaType, TKey> = {
  video: 'media.video',
  pdf: 'media.pdf',
  audio: 'media.audio',
  image: 'media.image',
  file: 'media.file',
};
import { errorMessage } from '@/lib/errors';

export function CoursePage({
  courseId,
  onBack,
  onOpenLesson,
  onOpenQuiz,
  onOpenCertificate,
}: {
  courseId: string;
  onBack: () => void;
  onOpenLesson: (courseId: string, lessonId: string) => void;
  onOpenQuiz: (courseId: string, moduleId: string) => void;
  onOpenCertificate: (courseId: string) => void;
}) {
  const { user } = useUser();
  const { t } = useI18n();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<ModuleWithLessons[]>([]);
  const [progressList, setProgressList] = useState<LessonProgress[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [creatorName, setCreatorName] = useState<string>('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
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

      const [mods, lp, existingEnrollment, quizzes] = await Promise.all([
        fetchModulesWithLessons(courseId),
        fetchLessonProgress(user.id, courseId),
        fetchEnrollment(user.id, courseId),
        // Optional: the course still works if quizzes can't be loaded.
        fetchCourseQuizStatus(courseId).catch(() => new Map<string, QuizStatus>()),
      ]);
      setQuizStatus(quizzes);

      // Creators previewing their own course shouldn't count as students.
      const activeEnrollment =
        existingEnrollment ??
        (c.creator_id === user.id ? null : await createEnrollment(user.id, courseId));
      setEnrollment(activeEnrollment);

      setModules(mods);
      setProgressList(lp);
      setCreatorName(await fetchCreatorName(c.creator_id));

      // Auto-expand first module
      if (mods.length > 0) {
        setExpandedModules(new Set([mods[0].id]));
      }
    } catch (err) {
      setError(errorMessage(err, t('course.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [user, courseId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const handleLessonClick = async (lessonId: string) => {
    if (!user) return;
    try {
      await updateLastLesson(user.id, courseId, lessonId);
    } catch {
      // Tracking the last lesson is best-effort; never block opening it.
    }
    onOpenLesson(courseId, lessonId);
  };

  const handleCopyLink = () => {
    if (!course) return;
    const link = buildCourseDeepLink(course.id);
    navigator.clipboard
      ?.writeText(link)
      .then(() => {
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard can be unavailable inside some Telegram webviews.
        window.prompt(t('course.copyPrompt'), link);
      });
  };

  if (loading) return (
    <>
      <AppHeader title={t('course.title')} onBack={onBack} />
      <LoadingScreen message={t('course.loading')} />
    </>
  );

  if (error) return (
    <>
      <AppHeader title={t('course.title')} onBack={onBack} />
      <ErrorState message={error} onRetry={load} />
    </>
  );

  if (!course) return null;

  const completedSet = new Set(progressList.filter((p) => p.completed).map((p) => p.lesson_id));
  const progress = calculateProgress(modules, progressList);
  const totalModules = modules.length;

  const lastLessonId = enrollment?.last_lesson_id ?? null;

  const allLessonsOrdered = getAllLessonsOrdered(modules);
  const locked = lockedModuleIds(modules, quizStatus, course.quiz_gating);
  // First module whose quiz is not passed yet (only quizzes with questions count).
  const pendingQuizModule = modules.find((m) => {
    const st = quizStatus.get(m.id);
    return hasQuiz(st) && !st.passed;
  }) ?? null;
  const allLessonsDone = progress.total_lessons > 0 && progress.completed_lessons >= progress.total_lessons;

  type NextStep =
    | { kind: 'lesson'; lesson: Lesson; start: boolean }
    | { kind: 'quiz'; module: ModuleWithLessons }
    | { kind: 'finished' };
  const nextStep: NextStep | null = (() => {
    if (progress.total_lessons === 0) return null;
    if (allLessonsDone) {
      return pendingQuizModule ? { kind: 'quiz', module: pendingQuizModule } : { kind: 'finished' };
    }
    const next = pickNextLesson(modules, completedSet, lastLessonId);
    if (!next) return null;
    const nextModule = modules.find((m) => m.lessons.some((l) => l.id === next.id));
    // The next lesson is behind a quiz: take that quiz first.
    if (nextModule && locked.has(nextModule.id) && pendingQuizModule) {
      return { kind: 'quiz', module: pendingQuizModule };
    }
    return { kind: 'lesson', lesson: next, start: progress.completed_lessons === 0 && !lastLessonId };
  })();

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title={course.title}
        onBack={onBack}
        rightAction={
          <button
            onClick={handleCopyLink}
            className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 active:scale-90 transition-all"
            aria-label={t('course.share')}
          >
            {linkCopied ? (
              <CheckIcon className="h-5 w-5 text-green-500" />
            ) : (
              <Share2 className="h-5 w-5 text-slate-600" />
            )}
          </button>
        }
      />

      <div className="px-4 py-5 space-y-5">
        {/* Course header */}
        <Card className="p-5">
          {course.cover_url && (
            <div className="h-40 -mx-5 -mt-5 mb-4 rounded-t-2xl bg-slate-100 overflow-hidden">
              <img src={course.cover_url} alt={course.title} className="w-full h-full object-cover" />
            </div>
          )}
          <h1 dir="auto" className="text-xl font-bold text-slate-900 text-left rtl:text-right">{course.title}</h1>
          <p dir="auto" className="text-sm text-slate-600 mt-2 text-start">{course.description}</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
              {creatorName.charAt(0).toUpperCase()}
            </div>
            <span>{t('course.by', { name: creatorName })}</span>
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-slate-500">
              <BookOpen className="h-4 w-4" />
              <span>{t('common.modulesCount', { n: totalModules })}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <FileText className="h-4 w-4" />
              <span>{t('common.lessonsCount', { n: progress.total_lessons })}</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-700">{t('course.overall')}</span>
              <span className="text-sm font-bold text-blue-500">{progress.progress_percent}%</span>
            </div>
            <ProgressBar percent={progress.progress_percent} />
          </div>

          {/* The one obvious next step: a lesson, a quiz, or the certificate. */}
          {nextStep?.kind === 'finished' && (
            <div className="mt-4 rounded-xl bg-green-50 border border-green-200 p-3">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <Trophy className="h-5 w-5 text-white" />
                </div>
                <p className="flex-1 text-sm font-semibold text-green-700">{t('course.finished')}</p>
              </div>
              {enrollment && (
                <button
                  onClick={() => onOpenCertificate(courseId)}
                  className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold active:scale-[0.98] transition-all"
                >
                  <Award className="h-4 w-4" />
                  {t('course.certificate')}
                </button>
              )}
              <button
                onClick={() => handleLessonClick(allLessonsOrdered[0].id)}
                className="mt-2 w-full text-xs font-semibold text-green-700 underline-offset-2 hover:underline"
              >
                {t('course.reviewFromStart')}
              </button>
            </div>
          )}
          {nextStep?.kind === 'quiz' && (
            <button
              onClick={() => onOpenQuiz(courseId, nextStep.module.id)}
              className="mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-purple-500 text-white text-sm font-semibold active:scale-[0.98] shadow-sm transition-all min-w-0"
            >
              <ClipboardList className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {t('course.takeQuiz')} <bdi>{nextStep.module.title}</bdi>
              </span>
            </button>
          )}
          {nextStep?.kind === 'lesson' && (
            <button
              onClick={() => handleLessonClick(nextStep.lesson.id)}
              className="mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 active:scale-[0.98] shadow-sm transition-all min-w-0"
            >
              <Play className="h-4 w-4 fill-white flex-shrink-0" />
              {nextStep.start ? (
                t('course.start')
              ) : (
                <span className="truncate">
                  {t('course.continue')} <bdi>{nextStep.lesson.title}</bdi>
                </span>
              )}
            </button>
          )}
        </Card>

        {/* Modules */}
        <div className="space-y-3">
          {modules.map((module, index) => {
            const expanded = expandedModules.has(module.id);
            const moduleCompleted = module.lessons.filter((l) => completedSet.has(l.id)).length;
            const moduleTotal = module.lessons.length;
            const isLocked = locked.has(module.id);
            const quiz = quizStatus.get(module.id);

            return (
              <Card key={module.id} className="overflow-hidden">
                <button
                  onClick={() => toggleModule(module.id)}
                  className="w-full flex items-center gap-3 p-4 text-start"
                >
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isLocked ? 'bg-slate-100' : 'bg-blue-50'}`}>
                    {isLocked ? (
                      <Lock className="h-4 w-4 text-slate-400" />
                    ) : (
                      <span className="text-sm font-bold text-blue-500">{index + 1}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 dir="auto" className={`font-semibold truncate text-left rtl:text-right ${isLocked ? 'text-slate-500' : 'text-slate-900'}`}>{module.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isLocked ? t('course.moduleLocked') : t('course.moduleProgress', { done: moduleCompleted, total: moduleTotal })}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${
                      expanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {expanded && (
                  <div className="border-t border-slate-100">
                    {module.lessons.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-slate-400">{t('course.noLessons')}</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {module.lessons.map((lesson, lIdx) => {
                          const state = getLessonState(lesson.id, completedSet, lastLessonId);
                          return (
                            <button
                              key={lesson.id}
                              onClick={() => handleLessonClick(lesson.id)}
                              disabled={isLocked}
                              className="w-full flex items-center gap-3 px-4 py-3 text-start enabled:hover:bg-slate-50 enabled:active:bg-slate-100 disabled:opacity-50 transition-colors"
                            >
                              <div className="flex-shrink-0">
                                {isLocked ? (
                                  <div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center">
                                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                                  </div>
                                ) : state === 'completed' ? (
                                  <div className="h-7 w-7 rounded-full bg-green-500 flex items-center justify-center">
                                    <Check className="h-4 w-4 text-white" strokeWidth={3} />
                                  </div>
                                ) : state === 'in_progress' ? (
                                  <div className="h-7 w-7 rounded-full border-2 border-blue-500 bg-blue-50 flex items-center justify-center">
                                    <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                                  </div>
                                ) : (
                                  <div className="h-7 w-7 rounded-full border-2 border-slate-300 flex items-center justify-center">
                                    <span className="text-xs font-medium text-slate-400">{lIdx + 1}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  dir="auto"
                                  className={`text-sm font-medium truncate text-left rtl:text-right ${
                                    state === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'
                                  }`}
                                >
                                  {lesson.title}
                                </p>
                                {lesson.media_type ? (
                                  <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                                    <span>{t(mediaLabelKeys[lesson.media_type])}</span>
                                    {formatDuration(lesson.media_duration) && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <bdi>{formatDuration(lesson.media_duration)}</bdi>
                                      </>
                                    )}
                                  </p>
                                ) : lesson.description ? (
                                  <p dir="auto" className="text-xs text-slate-400 truncate mt-0.5 text-start">
                                    {lesson.description}
                                  </p>
                                ) : null}
                              </div>
                              {lesson.media_type && (
                                <MediaThumb
                                  source={{ lessonId: lesson.id }}
                                  mediaType={lesson.media_type}
                                  hasThumb={!!lesson.media_thumb_file_id}
                                  className="h-11 w-16 rounded-lg"
                                  iconClassName="h-5 w-5"
                                />
                              )}
                              <ChevronDown className="h-4 w-4 text-slate-300 -rotate-90 rtl:rotate-90" />
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Module quiz */}
                    {hasQuiz(quiz) && (
                      <button
                        onClick={() => onOpenQuiz(courseId, module.id)}
                        disabled={isLocked}
                        className="w-full flex items-center gap-3 px-4 py-3 border-t border-slate-100 text-start bg-purple-50/40 enabled:hover:bg-purple-50 disabled:opacity-50 transition-colors"
                      >
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${quiz.passed ? 'bg-green-500' : 'bg-purple-100'}`}>
                          {quiz.passed ? (
                            <Check className="h-4 w-4 text-white" strokeWidth={3} />
                          ) : (
                            <ClipboardList className="h-3.5 w-3.5 text-purple-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-purple-700">{t('quiz.title')}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {quiz.passed
                              ? t('course.quizPassed', { score: quiz.best_score ?? 0, total: quiz.best_total ?? 0 })
                              : quiz.attempts > 0
                                ? t('course.quizRetry', { score: quiz.best_score ?? 0, total: quiz.best_total ?? 0 })
                                : t('course.quizInfo', { n: quiz.question_count, pass: quiz.pass_percent })}
                          </p>
                        </div>
                        <ChevronDown className="h-4 w-4 text-slate-300 -rotate-90 rtl:rotate-90" />
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* Deep link share info */}
        <Card className="p-4 bg-slate-50">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <LinkIcon className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{t('course.shareLink', { link: buildCourseDeepLink(course.id) })}</span>
          </div>
          <button
            onClick={handleCopyLink}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-blue-500"
          >
            {linkCopied ? (
              <><CheckIcon className="h-4 w-4" /> {t('course.copied')}</>
            ) : (
              <><Copy className="h-4 w-4" /> {t('course.copyLink')}</>
            )}
          </button>
        </Card>
      </div>
    </div>
  );
}
