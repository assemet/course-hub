import { Check, X, Sparkles, ChevronLeft } from 'lucide-react';
import { useI18n, type TKey } from '@/lib/i18n';

export interface OnboardingProgress {
  hasCourse: boolean;
  /** Posts forwarded to the bot (waiting in the inbox) or already lessons. */
  hasImports: boolean;
  hasLessons: boolean;
  hasPublished: boolean;
}

interface Step {
  done: boolean;
  title: TKey;
  desc: TKey;
  action: TKey;
  onAction: () => void;
}

/**
 * First-run guide on the creator dashboard: the four steps from an empty
 * account to a course students can open. Each step ticks itself from the
 * creator's data; the card hides once all are done (the dashboard also hides
 * it when dismissed).
 */
export function OnboardingChecklist({
  progress,
  onCreateCourse,
  onOpenBot,
  onOpenImports,
  onOpenCourse,
  onDismiss,
}: {
  progress: OnboardingProgress;
  onCreateCourse: () => void;
  onOpenBot: () => void;
  onOpenImports: () => void;
  /** Opens the editor of the creator's first course (to publish and share it). */
  onOpenCourse: () => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();

  const steps: Step[] = [
    { done: progress.hasCourse, title: 'onboard.s1.title', desc: 'onboard.s1.desc', action: 'onboard.s1.action', onAction: onCreateCourse },
    { done: progress.hasImports, title: 'onboard.s2.title', desc: 'onboard.s2.desc', action: 'onboard.s2.action', onAction: onOpenBot },
    { done: progress.hasLessons, title: 'onboard.s3.title', desc: 'onboard.s3.desc', action: 'onboard.s3.action', onAction: onOpenImports },
    { done: progress.hasPublished, title: 'onboard.s4.title', desc: 'onboard.s4.desc', action: 'onboard.s4.action', onAction: onOpenCourse },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  // The first unfinished step is the one to do now; it alone gets a button.
  const current = steps.findIndex((s) => !s.done);

  return (
    <section aria-labelledby="onboarding-title" className="rounded-3xl bg-surface p-4 shadow-[0_1px_3px_rgba(11,36,99,0.06)]">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Sparkles className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 id="onboarding-title" className="text-base font-bold text-slate-900">{t('onboard.title')}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t('onboard.subtitle', { done: doneCount, total: steps.length })}</p>
        </div>
        <button
          onClick={onDismiss}
          aria-label={t('onboard.dismiss')}
          className="h-9 w-9 -m-1 rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-100 active:scale-90 transition-all"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>

      <ol className="mt-3 space-y-1">
        {steps.map((step, i) => {
          const isCurrent = i === current;
          return (
            <li key={step.title} className={`rounded-2xl px-3 py-2.5 ${isCurrent ? 'bg-blue-50' : ''}`}>
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    step.done
                      ? 'bg-green-500 text-white'
                      : isCurrent
                        ? 'bg-blue-500 text-white'
                        : 'border-2 border-slate-200 text-slate-400'
                  }`}
                >
                  {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${step.done ? 'text-slate-500' : 'text-slate-900'}`}>{t(step.title)}</p>
                  {isCurrent && (
                    <>
                      <p className="text-xs leading-relaxed text-slate-600 mt-1">{t(step.desc)}</p>
                      <button
                        onClick={step.onAction}
                        className="mt-2.5 inline-flex items-center gap-1 h-10 px-4 rounded-xl bg-blue-500 text-white text-sm font-semibold active:scale-95 transition-transform"
                      >
                        {t(step.action)}
                        <ChevronLeft className="h-4 w-4 ltr:rotate-180" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
