import { useEffect, useState } from 'react';
import { ImageOff, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { loadQuestionImage } from '@/lib/mediaService';

/**
 * The picture attached to a quiz question. Tap to see it full screen
 * (diagrams and code screenshots are often too small inline).
 */
export function QuestionImage({ questionId, imageFileId }: { questionId: string; imageFileId: string }) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    loadQuestionImage(questionId, imageFileId)
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [questionId, imageFileId]);

  if (failed) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500">
        <ImageOff className="h-4 w-4 flex-shrink-0" />
        {t('quiz.imageFailed')}
      </div>
    );
  }

  if (!src) {
    return <div className="mt-3 h-44 w-full rounded-xl bg-slate-100 animate-pulse" aria-hidden="true" />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setZoomed(true)}
        aria-label={t('quiz.zoomImage')}
        className="mt-3 block w-full overflow-hidden rounded-xl bg-slate-100"
      >
        <img src={src} alt="" className="mx-auto max-h-72 w-full object-contain" />
      </button>
      {zoomed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('quiz.zoomImage')}
          onClick={() => setZoomed(false)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
        >
          <img src={src} alt="" className="max-h-full max-w-full object-contain" />
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label={t('common.close')}
            className="absolute top-[calc(env(safe-area-inset-top)+12px)] end-3 h-10 w-10 rounded-full bg-white/15 flex items-center justify-center"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>
      )}
    </>
  );
}
