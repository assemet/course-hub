import { useCallback, useEffect, useState } from 'react';
import { MessageCircleQuestion, Lock, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { AppHeader } from '@/components/AppHeader';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState, EmptyState } from '@/components/StateViews';
import { ReplyForm } from '@/components/LessonQuestions';
import { useUser } from '@/hooks/useUser';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { fetchCoursesByCreator } from '@/lib/courseService';
import { fetchUnansweredQuestions, type InboxQuestion } from '@/lib/questionService';
import type { Course } from '@/lib/types';

/**
 * Every unanswered question across the creator's courses, oldest first, with a
 * reply box right there. Answered ones drop out of the list; the student gets
 * the answer through the bot.
 */
export function QuestionsInbox({
  onBack,
  onOpenLesson,
}: {
  onBack: () => void;
  onOpenLesson: (courseId: string, lessonId: string) => void;
}) {
  const { user } = useUser();
  const { t, formatRelative } = useI18n();
  const [courses, setCourses] = useState<Map<string, Course>>(new Map());
  const [questions, setQuestions] = useState<InboxQuestion[]>([]);
  const [answered, setAnswered] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const mine = await fetchCoursesByCreator(user.id);
      setCourses(new Map(mine.map((c) => [c.id, c])));
      setQuestions(await fetchUnansweredQuestions(mine.map((c) => c.id)));
    } catch (err) {
      setError(errorMessage(err, t('qa.err.load')));
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingScreen message={t('common.loading')} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader title={t('qa.inbox.title')} onBack={onBack} />
      <div className="px-4 py-5 space-y-3 pb-24">
        {answered > 0 && (
          <p role="status" className="flex items-center gap-1.5 rounded-2xl bg-green-50 px-3.5 py-2.5 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4" />
            {t('qa.inbox.answered', { n: answered })}
          </p>
        )}

        {questions.length === 0 ? (
          <EmptyState
            title={t('qa.inbox.empty.title')}
            description={t('qa.inbox.empty.desc')}
            icon={<MessageCircleQuestion className="h-7 w-7 text-slate-400" />}
          />
        ) : (
          <>
            <p className="text-sm text-slate-500">{t('qa.inbox.count', { n: questions.length })}</p>
            {questions.map((q) => {
              const course = courses.get(q.course_id);
              return (
                <article key={q.id} className="rounded-[20px] bg-surface p-4 shadow-[0_1px_3px_rgba(11,36,99,0.06)]">
                  <button
                    onClick={() => onOpenLesson(q.course_id, q.lesson_id)}
                    className="w-full flex items-center gap-1 text-start text-xs text-blue-600 min-h-[28px]"
                  >
                    <span dir="auto" className="truncate">
                      {course?.title ?? ''} · {q.lesson?.title ?? ''}
                    </span>
                    <ChevronLeft className="h-3.5 w-3.5 flex-shrink-0 ltr:rotate-180" />
                  </button>
                  <div className="mt-1 flex items-center gap-2 flex-wrap">
                    <span dir="auto" className="text-sm font-semibold text-slate-900">
                      {q.author?.first_name || t('qa.student')}
                    </span>
                    <span className="text-xs text-slate-400">{formatRelative(q.created_at)}</span>
                    {q.is_private && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        <Lock className="h-3 w-3" />
                        {t('qa.privateBadge')}
                      </span>
                    )}
                  </div>
                  <p dir="auto" className="mt-1 text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words text-start">
                    {q.body}
                  </p>
                  <ReplyForm
                    questionId={q.id}
                    onSaved={() => {
                      setQuestions((list) => list.filter((x) => x.id !== q.id));
                      setAnswered((n) => n + 1);
                    }}
                  />
                </article>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
