import { useState } from 'react';
import { ImagePlus, Loader2, Check } from 'lucide-react';
import { Card } from '@/components/Card';
import { refreshCourseThumbnails } from '@/lib/mediaService';
import { useI18n } from '@/lib/i18n';

/** Safety cap: each call handles a batch, so this covers several hundred lessons. */
const MAX_ROUNDS = 60;

/**
 * Offers to recover previews for lessons that have a file but no thumbnail
 * (usually lessons imported before thumbnails were kept). Shown in the course
 * editor only while such lessons exist.
 */
export function ThumbnailRefreshCard({
  courseId,
  missing,
  onDone,
}: {
  courseId: string;
  /** Lessons still without a checked preview. */
  missing: number;
  /** Reload the lessons, so the new previews show. */
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [running, setRunning] = useState(false);
  const [checked, setChecked] = useState(0);
  const [total, setTotal] = useState(missing);
  const [result, setResult] = useState<{ updated: number; without: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (missing === 0 && !result) return null;

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    setChecked(0);
    setTotal(missing);
    let updated = 0;
    let without = 0;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const r = await refreshCourseThumbnails(courseId);
        updated += r.updated;
        without += r.without;
        setChecked(updated + without);
        // remaining can grow if lessons are added meanwhile; keep the bar honest.
        setTotal((prev) => Math.max(prev, updated + without + r.remaining));
        if (r.remaining === 0 || r.updated + r.without === 0) break;
      }
      setResult({ updated, without });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setError(code === 'chat_unavailable' ? t('thumbs.err.chat') : t('thumbs.err.failed'));
    } finally {
      setRunning(false);
      onDone();
    }
  };

  if (result && !running) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center flex-shrink-0">
            <Check className="h-5 w-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">{t('thumbs.done', { n: result.updated })}</p>
            {result.without > 0 && <p className="text-xs text-slate-500">{t('thumbs.without', { n: result.without })}</p>}
          </div>
        </div>
      </Card>
    );
  }

  const percent = total > 0 ? Math.min(100, Math.round((checked / total) * 100)) : 0;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
          <ImagePlus className="h-5 w-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{t('thumbs.title', { n: missing })}</p>
          <p className="text-xs text-slate-500">{running ? t('thumbs.running') : t('thumbs.desc')}</p>
        </div>
      </div>
      {running ? (
        <div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-slate-500 tabular-nums">{t('thumbs.progress', { done: checked, total })}</p>
        </div>
      ) : (
        <button
          onClick={run}
          className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-blue-500 text-white text-sm font-semibold active:scale-[0.98] transition-transform"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {t('thumbs.action')}
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </Card>
  );
}
