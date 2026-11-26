import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Check, X, Layers, PartyPopper, Repeat } from 'lucide-react';
import { Card } from '@/components/Card';
import { AppHeader } from '@/components/AppHeader';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { hapticFeedback } from '@/lib/telegram';
import { fetchCourseById, fetchModulesWithLessons } from '@/lib/courseService';
import { fetchCourseQuizStatus, lockedModuleIds, type QuizStatus } from '@/lib/quizService';
import { fetchCards, fetchMyReviews, reviewCard, buildSession, type Flashcard, type FlashcardReview } from '@/lib/flashcardService';
import type { Course, ModuleWithLessons } from '@/lib/types';

type Phase = 'study' | 'done' | 'nothing-due';

export function FlashcardScreen({
  courseId,
  moduleId,
  onBack,
}: {
  courseId: string;
  /** null = every unlocked module of the course */
  moduleId: string | null;
  onBack: () => void;
}) {
  const { t, formatRelative } = useI18n();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<ModuleWithLessons[]>([]);
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [reviews, setReviews] = useState<Map<string, FlashcardReview>>(new Map());
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [phase, setPhase] = useState<Phase>('study');
  const [known, setKnown] = useState(0);
  const [unknown, setUnknown] = useState(0);
  const [requeued, setRequeued] = useState<Set<string>>(new Set());
  const [saveFailed, setSaveFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback((all: boolean, allCards: Flashcard[], revs: Map<string, FlashcardReview>, mods: ModuleWithLessons[]) => {
    const session = buildSession(allCards, revs, mods.map((m) => m.id), all);
    setQueue(session);
    setIndex(0);
    setFlipped(false);
    setKnown(0);
    setUnknown(0);
    setRequeued(new Set());
    setPhase(session.length === 0 ? 'nothing-due' : 'study');
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [c, mods, quizzes] = await Promise.all([
        fetchCourseById(courseId),
        fetchModulesWithLessons(courseId),
        fetchCourseQuizStatus(courseId).catch(() => new Map<string, QuizStatus>()),
      ]);
      // Modules still closed by quiz gating are not reviewed yet.
      const locked = lockedModuleIds(mods, quizzes, !!c?.quiz_gating);
      const targets = mods.filter((m) => !locked.has(m.id) && (moduleId === null || m.id === moduleId));
      const allCards = await fetchCards(targets.map((m) => m.id));
      const revs = await fetchMyReviews(allCards.map((x) => x.id));
      setCourse(c);
      setModules(mods);
      setCards(allCards);
      setReviews(revs);
      start(false, allCards, revs, mods);
    } catch (err) {
      setError(errorMessage(err, t('cards.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [courseId, moduleId, start, t]);

  useEffect(() => {
    load();
  }, [load]);

  const current = queue[index];

  const answer = (isKnown: boolean) => {
    if (!current) return;
    hapticFeedback(isKnown ? 'success' : 'warning');
    // Save in the background; the session keeps moving.
    reviewCard(current.id, isKnown)
      .then((r) => setReviews((m) => new Map(m).set(r.card_id, r)))
      .catch(() => setSaveFailed(true));

    // Count each card once, by its first answer (a retried card isn't counted again).
    if (!requeued.has(current.id)) {
      if (isKnown) setKnown((n) => n + 1);
      else setUnknown((n) => n + 1);
    }

    let nextQueue = queue;
    // A missed card comes back once at the end of this session.
    if (!isKnown && !requeued.has(current.id)) {
      nextQueue = [...queue, current];
      setQueue(nextQueue);
      setRequeued((s) => new Set(s).add(current.id));
    }
    setFlipped(false);
    if (index + 1 < nextQueue.length) setIndex(index + 1);
    else setPhase('done');
  };

  // Soonest upcoming review among the cards in this deck.
  const nextDue = [...reviews.values()]
    .filter((r) => cards.some((c) => c.id === r.card_id) && new Date(r.due_at).getTime() > Date.now())
    .map((r) => r.due_at)
    .sort()[0];

  const deckTitle = moduleId ? modules.find((m) => m.id === moduleId)?.title ?? '' : t('cards.wholeCourse');

  if (loading) return (
    <>
      <AppHeader title={t('cards.title')} onBack={onBack} />
      <LoadingScreen />
    </>
  );
  if (error) return (
    <>
      <AppHeader title={t('cards.title')} onBack={onBack} />
      <ErrorState message={error} onRetry={load} />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader title={course?.title ?? t('cards.title')} onBack={onBack} />
      <div className="px-4 py-5 space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-teal-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-slate-700">{t('cards.title')}</p>
          <span aria-hidden="true" className="text-slate-300">·</span>
          <p dir="auto" className="text-sm text-slate-500 truncate">{deckTitle}</p>
        </div>

        {saveFailed && (
          <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">{t('cards.saveFailed')}</p>
        )}

        {phase === 'study' && current && (
          <>
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span>{t('cards.progress', { n: index + 1, total: queue.length })}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  <span className="text-green-600">✓ {known}</span>
                  <span className="text-red-500">✗ {unknown}</span>
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full bg-teal-500 transition-all" style={{ width: `${(index / queue.length) * 100}%` }} />
              </div>
            </div>

            {/* The card: tap to flip */}
            <button
              key={`${current.id}-${index}`}
              onClick={() => setFlipped((f) => !f)}
              aria-label={flipped ? t('cards.showFront') : t('cards.flip')}
              className="block w-full [perspective:1200px]"
            >
              <div
                className={`relative min-h-[280px] w-full motion-safe:transition-transform motion-safe:duration-500 [transform-style:preserve-3d] ${
                  flipped ? '[transform:rotateY(180deg)]' : ''
                }`}
              >
                <div className="absolute inset-0 [backface-visibility:hidden] rounded-3xl bg-surface border border-slate-200 shadow-md flex flex-col items-center justify-center p-6">
                  <span className="absolute top-4 start-4 text-[11px] font-semibold text-slate-400">{t('cards.front')}</span>
                  <p dir="auto" className="text-2xl font-bold text-slate-900 text-center whitespace-pre-wrap break-words">{current.front}</p>
                  <span className="absolute bottom-4 text-xs text-slate-400 flex items-center gap-1">
                    <RotateCcw className="h-3 w-3" /> {t('cards.tapToFlip')}
                  </span>
                </div>
                <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-3xl bg-teal-50 border border-teal-200 shadow-md flex flex-col items-center justify-center p-6">
                  <span className="absolute top-4 start-4 text-[11px] font-semibold text-teal-600">{t('cards.back')}</span>
                  <p dir="auto" className="text-xl font-semibold text-slate-800 text-center whitespace-pre-wrap break-words">{current.back}</p>
                </div>
              </div>
            </button>

            {flipped ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => answer(false)}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-xl border-2 border-red-300 bg-red-50 text-red-600 text-sm font-semibold active:scale-[0.98] transition-all"
                >
                  <X className="h-4 w-4" strokeWidth={3} /> {t('cards.didntKnow')}
                </button>
                <button
                  onClick={() => answer(true)}
                  className="flex items-center justify-center gap-2 py-3.5 rounded-xl bg-green-500 text-white text-sm font-semibold active:scale-[0.98] transition-all"
                >
                  <Check className="h-4 w-4" strokeWidth={3} /> {t('cards.knew')}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setFlipped(true)}
                className="w-full py-3.5 rounded-xl bg-teal-500 text-white text-sm font-semibold active:scale-[0.98] transition-all"
              >
                {t('cards.showAnswer')}
              </button>
            )}
          </>
        )}

        {(phase === 'done' || phase === 'nothing-due') && (
          <Card className="p-6 text-center">
            <div className={`mx-auto h-16 w-16 rounded-full flex items-center justify-center ${phase === 'done' ? 'bg-teal-500' : 'bg-slate-100'}`}>
              {phase === 'done' ? <PartyPopper className="h-8 w-8 text-white" /> : <Layers className="h-8 w-8 text-slate-400" />}
            </div>
            <h1 className="mt-4 text-lg font-bold text-slate-900">
              {phase === 'done' ? t('cards.doneTitle') : cards.length === 0 ? t('cards.noCards') : t('cards.nothingDue')}
            </h1>
            {phase === 'done' && (
              <p className="mt-2 text-sm text-slate-600">
                {t('cards.doneStats', { known, unknown })}
              </p>
            )}
            {nextDue && cards.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">{t('cards.nextDue', { when: formatRelative(nextDue) })}</p>
            )}
            <div className="mt-6 space-y-2">
              {cards.length > 0 && (
                <button
                  onClick={() => start(true, cards, reviews, modules)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-teal-500 text-white text-sm font-semibold active:scale-[0.98] transition-all"
                >
                  <Repeat className="h-4 w-4" /> {t('cards.practiceAll', { n: cards.length })}
                </button>
              )}
              <button onClick={onBack} className="w-full py-3 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">
                {t('complete.backToCourse')}
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
