import { useEffect, useState, useCallback } from 'react';
import { Play, BookOpen, Flame, Layers, ChevronLeft } from 'lucide-react';
import { Card } from '@/components/Card';
import { CourseCover } from '@/components/CourseCover';
import { ProgressBar } from '@/components/ProgressBar';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState, EmptyState } from '@/components/StateViews';
import { useUser } from '@/hooks/useUser';
import {
  fetchEnrolledCoursesWithProgress,
  fetchModulesWithLessons,
  fetchLessonProgress,
  findNextLesson,
  fetchStudyStreak,
} from '@/lib/courseService';
import { fetchCourseQuizStatus, lockedModuleIds } from '@/lib/quizService';
import { fetchFlashcardStats } from '@/lib/flashcardService';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import type { Course, CourseProgress, Enrollment, Lesson } from '@/lib/types';

interface ContinueLearningData {
  course: Course;
  progress: CourseProgress;
  enrollment: Enrollment;
  nextLesson: Lesson | null;
  nextModuleTitle: string | null;
  /** Flashcards due now in this course's unlocked modules. */
  dueCards: number;
}

export function StudentHome({
  onOpenCourse,
  onOpenLesson,
  onOpenFlashcards,
}: {
  onOpenCourse: (courseId: string) => void;
  onOpenLesson: (courseId: string, lessonId: string) => void;
  onOpenFlashcards: (courseId: string, moduleId: string | null) => void;
}) {
  const { user } = useUser();
  const { t } = useI18n();
  const [enrollments, setEnrollments] = useState<
    Array<{ course: Course; progress: CourseProgress; enrollment: Enrollment }>
  >([]);
  const [continueData, setContinueData] = useState<ContinueLearningData | null>(null);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const [enrolled, days] = await Promise.all([
        fetchEnrolledCoursesWithProgress(user.id),
        fetchStudyStreak(user.id),
      ]);
      setEnrollments(enrolled);
      setStreak(days);

      if (enrolled.length > 0) {
        const mostRecent = enrolled[0];
        const courseId = mostRecent.course.id;
        const [modules, progress, quizzes, cards] = await Promise.all([
          fetchModulesWithLessons(courseId),
          fetchLessonProgress(user.id, courseId),
          // Both only decorate the card: never fail the home screen for them.
          fetchCourseQuizStatus(courseId).catch(() => null),
          fetchFlashcardStats(courseId).catch(() => null),
        ]);
        const completedSet = new Set(progress.filter((p) => p.completed).map((p) => p.lesson_id));
        const nextLesson = await findNextLesson(
          modules,
          completedSet,
          mostRecent.enrollment.last_lesson_id
        );

        let nextModuleTitle: string | null = null;
        if (nextLesson) {
          const mod = modules.find((m) => m.id === nextLesson.module_id);
          nextModuleTitle = mod?.title ?? null;
        }

        // Same rule as the course page: cards in quiz-locked modules don't count.
        const locked = quizzes ? lockedModuleIds(modules, quizzes, mostRecent.course.quiz_gating) : new Set<string>();
        const dueCards = cards
          ? [...cards.values()].filter((s) => !locked.has(s.module_id)).reduce((n, s) => n + s.due, 0)
          : 0;

        setContinueData({
          course: mostRecent.course,
          progress: mostRecent.progress,
          enrollment: mostRecent.enrollment,
          nextLesson,
          nextModuleTitle,
          dueCards,
        });
      } else {
        setContinueData(null);
      }
    } catch (err) {
      setError(errorMessage(err, t('home.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingScreen message={t('home.loading')} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const percent = continueData?.progress.progress_percent ?? 0;

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src="/logo.webp" alt="" className="h-11 w-11 flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm text-slate-500">{t('home.welcome')}</p>
            <p dir="auto" className="text-xl font-bold text-slate-900 truncate text-start">{user?.first_name}</p>
          </div>
        </div>
        {streak >= 2 && (
          <div className="flex items-center gap-1.5 flex-shrink-0 rounded-full bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">
            <Flame className="h-[18px] w-[18px] text-amber-500" strokeWidth={2.4} />
            {t('home.streak', { n: streak })}
          </div>
        )}
      </div>

      {/* Continue Learning: the one thing to do now. */}
      {continueData ? (
        <div className="relative overflow-hidden rounded-3xl bg-[#0B2463] dark:bg-[#172B63] p-[18px] text-white shadow-[0_10px_30px_-12px_rgba(11,36,99,0.55)]">
          <div aria-hidden="true" className="absolute -top-16 -left-12 h-44 w-44 rounded-full bg-[#1565E0] opacity-45" />
          <div className="relative flex items-center gap-4">
            <div
              className="h-[76px] w-[76px] flex-shrink-0 rounded-full p-2"
              style={{ background: `conic-gradient(#F5A50A 0 ${percent}%, rgba(255,255,255,0.16) ${percent}% 100%)` }}
              role="img"
              aria-label={`${percent}%`}
            >
              <div className="h-full w-full rounded-full bg-[#0B2463] dark:bg-[#172B63] flex items-center justify-center text-[17px] font-bold tabular-nums">
                {percent}%
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#A9B8DD]">{t('home.continue')}</p>
              <h2 dir="auto" className="mt-0.5 text-[19px] font-bold leading-snug truncate text-start">
                {continueData.course.title}
              </h2>
              <p dir="auto" className="mt-0.5 text-[13px] text-[#D5DDF2] truncate text-start">
                {continueData.nextLesson && continueData.nextModuleTitle
                  ? t('home.nextLesson', { lesson: continueData.nextLesson.title })
                  : t('home.caughtUp')}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              if (continueData.nextLesson) {
                onOpenLesson(continueData.course.id, continueData.nextLesson.id);
              } else {
                onOpenCourse(continueData.course.id);
              }
            }}
            className="relative mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#F5A50A] text-base font-bold text-[#0B2463] active:scale-[0.98] transition-transform"
          >
            <Play className="h-[18px] w-[18px] fill-[#0B2463]" />
            {continueData.nextLesson ? t('home.continueLesson') : t('home.review')}
          </button>
        </div>
      ) : (
        <Card className="p-6 text-center">
          <EmptyState
            title={t('home.empty.title')}
            description={t('home.empty.desc')}
            icon={<BookOpen className="h-7 w-7 text-slate-400" />}
          />
        </Card>
      )}

      {/* Flashcards waiting in the current course */}
      {continueData && continueData.dueCards > 0 && (
        <Card className="p-3.5" onClick={() => onOpenFlashcards(continueData.course.id, null)}>
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-[14px] bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Layers className="h-[22px] w-[22px] text-purple-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-slate-900">{t('home.cardsDue', { n: continueData.dueCards })}</p>
              <p dir="auto" className="text-[13px] text-slate-500 truncate text-start">{continueData.course.title}</p>
            </div>
            <ChevronLeft className="h-5 w-5 text-slate-400 flex-shrink-0 ltr:rotate-180" />
          </div>
        </Card>
      )}

      {/* My Courses */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-3">{t('home.myCourses')}</h2>
        {enrollments.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-slate-500">{t('home.notEnrolled')}</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {enrollments.map(({ course, progress }) => (
              <Card key={course.id} className="overflow-hidden" onClick={() => onOpenCourse(course.id)}>
                <CourseCover course={course} className="h-24" />
                <div className="p-3">
                  <h3 dir="auto" className="text-sm font-semibold leading-snug text-slate-900 line-clamp-2 min-h-[2.5rem] text-start">
                    {course.title}
                  </h3>
                  <ProgressBar percent={progress.progress_percent} className="mt-2.5 h-1.5" />
                  <p className="mt-1.5 text-xs text-slate-500">
                    {t('common.lessonsProgress', { done: progress.completed_lessons, total: progress.total_lessons })}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
