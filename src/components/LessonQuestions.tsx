import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircleQuestion, Lock, Trash2, Send, Pencil, Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  answerQuestion,
  askQuestion,
  deleteQuestion,
  fetchLessonQuestions,
  type LessonQuestion,
} from '@/lib/questionService';

const MAX_QUESTION = 2000;
const MAX_ANSWER = 4000;

function Initial({ name }: { name: string }) {
  return (
    <span className="h-8 w-8 rounded-full bg-amber-100 text-amber-800 text-sm font-bold flex items-center justify-center flex-shrink-0">
      {Array.from(name)[0]?.toUpperCase() ?? '?'}
    </span>
  );
}

/** The creator's reply box: a new answer, or editing an existing one. */
export function ReplyForm({
  questionId,
  initial = '',
  onSaved,
  onCancel,
  autoFocus,
}: {
  questionId: string;
  initial?: string;
  onSaved: (answer: string) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useI18n();
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const trimmed = text.trim();

  const save = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    setError(false);
    try {
      await answerQuestion(questionId, trimmed);
      onSaved(trimmed);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 space-y-2">
      <label htmlFor={`reply-${questionId}`} className="sr-only">{t('qa.replyLabel')}</label>
      <textarea
        id={`reply-${questionId}`}
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_ANSWER))}
        placeholder={t('qa.replyPh')}
        rows={3}
        dir="auto"
        autoFocus={autoFocus}
        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-surface text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
      />
      {error && <p role="alert" className="text-xs text-red-600">{t('qa.err.reply')}</p>}
      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button onClick={onCancel} className="h-10 px-3 rounded-xl text-sm font-medium text-slate-600 active:bg-slate-100">
            {t('common.cancel')}
          </button>
        )}
        <button
          onClick={save}
          disabled={!trimmed || saving}
          className="h-10 px-4 rounded-xl bg-blue-500 text-white text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50 active:scale-95 transition-transform"
        >
          <Send className="h-4 w-4 rtl:-scale-x-100" />
          {saving ? t('qa.sending') : initial ? t('qa.saveReply') : t('qa.sendReply')}
        </button>
      </div>
    </div>
  );
}

/**
 * Questions under a lesson. Students ask (publicly, or privately to the
 * teacher) and see the answers; the course's creator answers, edits answers and
 * removes questions. New questions and answers are sent through the bot.
 */
export function LessonQuestions({
  lessonId,
  userId,
  isCreator,
  focus,
}: {
  lessonId: string;
  userId: string;
  isCreator: boolean;
  /** Opened from a bot message about a question: scroll here. */
  focus?: boolean;
}) {
  const { t, formatRelative } = useI18n();
  const sectionRef = useRef<HTMLElement>(null);
  const [questions, setQuestions] = useState<LessonQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [justAsked, setJustAsked] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setQuestions(await fetchLessonQuestions(lessonId));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (focus && !loading) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focus, loading]);

  const ask = async () => {
    const body = text.trim();
    if (!body || asking) return;
    setAsking(true);
    setAskError(null);
    try {
      await askQuestion(lessonId, body, isPrivate);
      setText('');
      setIsPrivate(false);
      setJustAsked(true);
      await load();
    } catch (err) {
      setAskError(err instanceof Error && err.message === 'too_many' ? t('qa.err.tooMany') : t('qa.err.ask'));
    } finally {
      setAsking(false);
    }
  };

  const remove = async (q: LessonQuestion) => {
    if (!window.confirm(t('qa.confirmDelete'))) return;
    try {
      await deleteQuestion(q.id);
      setQuestions((list) => list.filter((x) => x.id !== q.id));
    } catch {
      setAskError(t('qa.err.delete'));
    }
  };

  const saved = (id: string, answer: string) => {
    setQuestions((list) =>
      list.map((q) => (q.id === id ? { ...q, answer, answered_at: q.answered_at ?? new Date().toISOString() } : q))
    );
    setEditing(null);
  };

  return (
    <section ref={sectionRef} aria-labelledby="lesson-questions" className="scroll-mt-20 space-y-3">
      <h2 id="lesson-questions" className="flex items-center gap-2 text-base font-bold text-slate-900">
        <MessageCircleQuestion className="h-5 w-5 text-blue-500" />
        {t('qa.title')}
        {questions.length > 0 && <span className="text-sm font-medium text-slate-400 tabular-nums">({questions.length})</span>}
      </h2>

      {!isCreator && (
        <div className="rounded-2xl bg-slate-50 p-3.5 space-y-2.5">
          <label htmlFor="ask-question" className="sr-only">{t('qa.askLabel')}</label>
          <textarea
            id="ask-question"
            value={text}
            onChange={(e) => {
              setText(e.target.value.slice(0, MAX_QUESTION));
              setJustAsked(false);
            }}
            placeholder={t('qa.askPh')}
            rows={2}
            dir="auto"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-surface text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600 min-h-[40px]">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="h-4 w-4 rounded accent-blue-500"
              />
              <Lock className="h-3.5 w-3.5 text-slate-400" />
              {t('qa.private')}
            </label>
            <button
              onClick={ask}
              disabled={!text.trim() || asking}
              className="h-10 px-4 rounded-xl bg-blue-500 text-white text-sm font-semibold flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50 active:scale-95 transition-transform"
            >
              <Send className="h-4 w-4 rtl:-scale-x-100" />
              {asking ? t('qa.sending') : t('qa.ask')}
            </button>
          </div>
          {justAsked && (
            <p role="status" className="flex items-center gap-1.5 text-xs text-green-700">
              <Check className="h-3.5 w-3.5" />
              {t('qa.asked')}
            </p>
          )}
          {askError && <p role="alert" className="text-xs text-red-600">{askError}</p>}
        </div>
      )}

      {loading ? (
        <div className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
      ) : loadError ? (
        <p className="text-sm text-slate-500">
          {t('qa.err.load')}{' '}
          <button onClick={load} className="font-semibold text-blue-600">{t('common.tryAgain')}</button>
        </p>
      ) : questions.length === 0 ? (
        <p className="text-sm text-slate-500">{isCreator ? t('qa.empty.creator') : t('qa.empty.student')}</p>
      ) : (
        <ul className="space-y-3">
          {questions.map((q) => {
            const mine = q.author_id === userId;
            const name = mine ? t('qa.you') : q.author?.first_name || t('qa.student');
            const canDelete = isCreator || (mine && !q.answered_at);
            return (
              <li key={q.id} className="rounded-2xl border border-slate-200 p-3.5">
                <div className="flex items-start gap-2.5">
                  <Initial name={name} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span dir="auto" className="text-sm font-semibold text-slate-900">{name}</span>
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
                  </div>
                  {canDelete && (
                    <button
                      onClick={() => remove(q)}
                      aria-label={t('qa.delete')}
                      className="h-9 w-9 -m-1.5 rounded-xl flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {q.answer && editing !== q.id ? (
                  <div className="mt-3 rounded-xl bg-blue-50 px-3.5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-blue-700">{t('qa.teacherAnswer')}</p>
                      {isCreator && (
                        <button
                          onClick={() => setEditing(q.id)}
                          className="flex items-center gap-1 text-xs font-medium text-blue-600 min-h-[32px]"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t('qa.editReply')}
                        </button>
                      )}
                    </div>
                    <p dir="auto" className="mt-1 text-[15px] leading-relaxed text-slate-800 whitespace-pre-wrap break-words text-start">
                      {q.answer}
                    </p>
                  </div>
                ) : isCreator ? (
                  <ReplyForm
                    questionId={q.id}
                    initial={q.answer ?? ''}
                    onSaved={(a) => saved(q.id, a)}
                    onCancel={q.answer ? () => setEditing(null) : undefined}
                    autoFocus={editing === q.id}
                  />
                ) : (
                  <p className="mt-2 text-xs text-slate-500">{t('qa.waiting')}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
