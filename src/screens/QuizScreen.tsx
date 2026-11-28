import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, X, RotateCcw, ChevronRight, Trophy, ClipboardList } from 'lucide-react';
import { Card } from '@/components/Card';
import { AppHeader } from '@/components/AppHeader';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { CourseCompleteDialog } from '@/components/CourseCompleteDialog';
import { QuestionImage } from '@/components/QuestionImage';
import { useUser } from '@/hooks/useUser';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { hapticFeedback } from '@/lib/telegram';
import { fetchCourseById, fetchModulesWithLessons, fetchLessonProgress, getAllLessonsOrdered } from '@/lib/courseService';
import {
  fetchCourseQuizStatus, fetchQuizQuestions, submitQuiz, hasQuiz, optionLabel,
  type QuizQuestion, type QuizResult, type QuizStatus,
} from '@/lib/quizService';
import type { Course, ModuleWithLessons } from '@/lib/types';

export function QuizScreen({
  courseId,
  moduleId,
  onBack,
  onGoToLesson,
  onOpenCertificate,
}: {
  courseId: string;
  moduleId: string;
  onBack: () => void;
  /** Replace this screen with a lesson (continue after passing). */
  onGoToLesson: (courseId: string, lessonId: string) => void;
  onOpenCertificate: (courseId: string) => void;
}) {
  const { user } = useUser();
  const { t } = useI18n();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<ModuleWithLessons[]>([]);
  const [statuses, setStatuses] = useState<Map<string, QuizStatus>>(new Map());
  const [completedLessons, setCompletedLessons] = useState<Set<string>>(new Set());
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showComplete, setShowComplete] = useState(false);

  const status = statuses.get(moduleId);
  const currentModule = modules.find((m) => m.id === moduleId) ?? null;

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const [c, mods, st, lp] = await Promise.all([
        fetchCourseById(courseId),
        fetchModulesWithLessons(courseId),
        fetchCourseQuizStatus(courseId),
        fetchLessonProgress(user.id, courseId),
      ]);
      const s = st.get(moduleId);
      if (!c || !hasQuiz(s)) {
        setError(t('quiz.notFound'));
        return;
      }
      const qs = await fetchQuizQuestions(s.quiz_id);
      setCourse(c);
      setModules(mods);
      setStatuses(st);
      setCompletedLessons(new Set(lp.filter((p) => p.completed).map((p) => p.lesson_id)));
      setQuestions(qs);
      setAnswers(qs.map(() => -1));
    } catch (err) {
      setError(errorMessage(err, t('quiz.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [user, courseId, moduleId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const answered = answers.filter((a) => a >= 0).length;

  const handleSubmit = async () => {
    if (!status || answered < questions.length) return;
    try {
      setSubmitting(true);
      setSubmitError(null);
      const r = await submitQuiz(status.quiz_id, answers);
      setResult(r);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      hapticFeedback(r.passed ? 'success' : 'warning');

      if (r.passed) {
        const updated = new Map(statuses).set(moduleId, { ...status, passed: true });
        setStatuses(updated);
        // Passing the last open quiz of a finished course completes it.
        const allLessonsDone = getAllLessonsOrdered(modules).every((l) => completedLessons.has(l.id));
        const allQuizzesPassed = [...updated.values()].every((s) => !hasQuiz(s) || s.passed);
        if (allLessonsDone && allQuizzesPassed) setShowComplete(true);
      }
    } catch (err) {
      setSubmitError(errorMessage(err, t('quiz.submitFailed')));
      hapticFeedback('error');
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => {
    setResult(null);
    setAnswers(questions.map(() => -1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Where to go after passing: the first lesson of the next module, if any.
  const nextModuleLesson = useMemo(() => {
    const i = modules.findIndex((m) => m.id === moduleId);
    return modules.slice(i + 1).find((m) => m.lessons.length > 0)?.lessons[0] ?? null;
  }, [modules, moduleId]);

  const title = currentModule?.title ?? t('quiz.title');

  if (loading) return (
    <>
      <AppHeader title={t('quiz.title')} onBack={onBack} />
      <LoadingScreen />
    </>
  );
  if (error || !status) return (
    <>
      <AppHeader title={t('quiz.title')} onBack={onBack} />
      <ErrorState message={error ?? t('quiz.notFound')} onRetry={load} />
    </>
  );

  const resultFor = (questionId: string) => result?.results.find((r) => r.question_id === questionId);
  const percent = result ? Math.round((result.score / Math.max(result.total, 1)) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader title={course?.title ?? t('quiz.title')} onBack={onBack} />

      <div className="px-4 py-5 space-y-4 pb-32">
        {/* Intro or result */}
        {result ? (
          <Card className={`p-5 text-center ${result.passed ? 'border-green-300' : 'border-amber-300'}`}>
            <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center ${result.passed ? 'bg-green-500' : 'bg-amber-500'}`}>
              {result.passed ? <Trophy className="h-8 w-8 text-white" /> : <RotateCcw className="h-8 w-8 text-white" />}
            </div>
            <p className="mt-3 text-3xl font-bold text-slate-900 tabular-nums">
              <bdi>{result.score}/{result.total}</bdi>
            </p>
            <p className="text-sm text-slate-500 tabular-nums">{percent}%</p>
            <p className={`mt-2 text-base font-semibold ${result.passed ? 'text-green-600' : 'text-amber-600'}`}>
              {result.passed ? t('quiz.passed') : t('quiz.failed', { pass: result.pass_percent })}
            </p>
          </Card>
        ) : (
          <Card className="p-5">
            <div className="flex items-start gap-3">
              <div className="h-11 w-11 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                <ClipboardList className="h-5 w-5 text-purple-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-bold text-slate-900">{t('quiz.title')}</h1>
                <p dir="auto" className="text-sm text-slate-500 text-start">{title}</p>
              </div>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {t('quiz.intro', { n: questions.length, pass: status.pass_percent })}
            </p>
            {status.attempts > 0 && status.best_total !== null && (
              <p className="mt-1 text-xs text-slate-400">
                {t('quiz.previousBest', { score: status.best_score ?? 0, total: status.best_total })}
                {status.passed && ` · ${t('quiz.alreadyPassed')}`}
              </p>
            )}
          </Card>
        )}

        {/* Questions */}
        {questions.map((q, qi) => {
          const r = resultFor(q.id);
          return (
            <Card key={q.id} className="p-4">
              <p className="text-xs font-semibold text-slate-400 mb-1">{t('quiz.questionN', { n: qi + 1, total: questions.length })}</p>
              <p dir="auto" className="text-sm font-semibold text-slate-900 text-start whitespace-pre-wrap">{q.question}</p>
              {q.image_file_id && <QuestionImage questionId={q.id} imageFileId={q.image_file_id} />}
              <div
                className={`mt-3 ${q.kind === 'true_false' ? 'grid grid-cols-2 gap-2' : 'space-y-2'}`}
                role="radiogroup"
                aria-label={q.question}
              >
                {q.options.map((opt, oi) => {
                  const chosen = answers[qi] === oi;
                  const isCorrect = r && oi === r.correct_index;
                  const isWrongChoice = r && chosen && !r.is_correct;
                  return (
                    <button
                      key={oi}
                      role="radio"
                      aria-checked={chosen}
                      disabled={!!result}
                      onClick={() => setAnswers((a) => a.map((x, j) => (j === qi ? oi : x)))}
                      className={`w-full flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-sm text-start transition-colors ${
                        isCorrect
                          ? 'border-green-500 bg-green-50 text-green-800'
                          : isWrongChoice
                            ? 'border-red-400 bg-red-50 text-red-700'
                            : chosen
                              ? 'border-blue-500 bg-blue-50 text-blue-800'
                              : 'border-slate-200 text-slate-700 enabled:active:bg-slate-50'
                      }`}
                    >
                      <span
                        className={`h-5 w-5 flex-shrink-0 rounded-full border-2 flex items-center justify-center ${
                          isCorrect ? 'border-green-500 bg-green-500' : isWrongChoice ? 'border-red-400 bg-red-400' : chosen ? 'border-blue-500 bg-blue-500' : 'border-slate-300'
                        }`}
                      >
                        {isCorrect ? <Check className="h-3 w-3 text-white" strokeWidth={4} /> : isWrongChoice ? <X className="h-3 w-3 text-white" strokeWidth={4} /> : chosen ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                      </span>
                      <span dir="auto" className="flex-1">{optionLabel(q, opt, t)}</span>
                    </button>
                  );
                })}
              </div>
              {r?.explanation && (
                <p dir="auto" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 text-start">
                  💡 {r.explanation}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {/* Bottom action */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-surface/90 backdrop-blur-md border-t border-slate-200/60 px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="max-w-lg mx-auto">
          {submitError && <p role="alert" className="mb-2 text-center text-sm text-red-600">{submitError}</p>}
          {!result ? (
            <button
              onClick={handleSubmit}
              disabled={submitting || answered < questions.length}
              className="w-full py-3.5 rounded-xl bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {submitting
                ? t('quiz.submitting')
                : answered < questions.length
                  ? t('quiz.answeredCount', { done: answered, total: questions.length })
                  : t('quiz.submit')}
            </button>
          ) : result.passed ? (
            <button
              onClick={() => (nextModuleLesson ? onGoToLesson(courseId, nextModuleLesson.id) : onBack())}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-500 text-white text-sm font-semibold active:scale-[0.98] transition-all min-w-0"
            >
              <span className="truncate">
                {nextModuleLesson ? <>{t('lesson.nextPrefix')} <bdi>{nextModuleLesson.title}</bdi></> : t('complete.backToCourse')}
              </span>
              <ChevronRight className="h-4 w-4 flex-shrink-0 rtl:rotate-180" />
            </button>
          ) : (
            <button
              onClick={retry}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-blue-500 text-white text-sm font-semibold active:scale-[0.98] transition-all"
            >
              <RotateCcw className="h-4 w-4" />
              {t('quiz.retry')}
            </button>
          )}
        </div>
      </div>

      {showComplete && course && (
        <CourseCompleteDialog
          courseId={course.id}
          courseTitle={course.title}
          lessonCount={getAllLessonsOrdered(modules).length}
          onClose={() => setShowComplete(false)}
          onBackToCourse={() => {
            setShowComplete(false);
            onBack();
          }}
          onGetCertificate={() => {
            setShowComplete(false);
            onOpenCertificate(course.id);
          }}
        />
      )}
    </div>
  );
}
