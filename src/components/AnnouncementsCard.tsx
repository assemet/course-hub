import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Send, Check } from 'lucide-react';
import { Card } from '@/components/Card';
import { useI18n } from '@/lib/i18n';
import {
  ANNOUNCEMENTS_PER_DAY,
  ANNOUNCEMENT_MAX_LENGTH,
  fetchAnnouncements,
  sendAnnouncement,
  sentToday,
  type CourseAnnouncement,
} from '@/lib/questionService';

/**
 * Course editor: write one message that the bot sends to every enrolled
 * student (and that shows on the course page). Limited to a few a day, since
 * students who get too many messages block the bot.
 */
export function AnnouncementsCard({ courseId, published }: { courseId: string; published: boolean }) {
  const { t, formatRelative } = useI18n();
  const [history, setHistory] = useState<CourseAnnouncement[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ delivered: number; recipients: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setHistory(await fetchAnnouncements(courseId, 5));
    } catch {
      // The composer still works without the history.
    }
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const left = Math.max(0, ANNOUNCEMENTS_PER_DAY - sentToday(history));
  const trimmed = text.trim();

  const send = async () => {
    if (!trimmed || sending || left === 0) return;
    if (!window.confirm(t('announce.confirm'))) return;
    setSending(true);
    setError(null);
    setResult(null);
    const r = await sendAnnouncement(courseId, trimmed);
    setSending(false);
    if (r.ok) {
      setText('');
      setResult({ delivered: r.delivered, recipients: r.recipients });
      load();
    } else {
      setError(
        r.error === 'daily_limit'
          ? t('announce.err.limit', { n: ANNOUNCEMENTS_PER_DAY })
          : r.error === 'not_published'
            ? t('announce.err.unpublished')
            : t('announce.err.failed')
      );
    }
  };

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Megaphone className="h-5 w-5 text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{t('announce.title')}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{t('announce.desc')}</p>
        </div>
      </div>

      {!published ? (
        <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">{t('announce.err.unpublished')}</p>
      ) : (
        <>
          <label htmlFor="announce-text" className="sr-only">{t('announce.title')}</label>
          <textarea
            id="announce-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value.slice(0, ANNOUNCEMENT_MAX_LENGTH));
              setResult(null);
            }}
            placeholder={t('announce.ph')}
            rows={3}
            dir="auto"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{t('announce.left', { n: left })}</p>
            <button
              onClick={send}
              disabled={!trimmed || sending || left === 0}
              className="h-10 px-4 rounded-xl bg-blue-500 text-white text-sm font-semibold flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50 active:scale-95 transition-transform"
            >
              <Send className="h-4 w-4 rtl:-scale-x-100" />
              {sending ? t('announce.sending') : t('announce.send')}
            </button>
          </div>
          {result && (
            <p role="status" className="flex items-center gap-1.5 text-xs text-green-700">
              <Check className="h-3.5 w-3.5" />
              {t('announce.sent', { delivered: result.delivered, total: result.recipients })}
            </p>
          )}
          {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        </>
      )}

      {history.length > 0 && (
        <div className="border-t border-slate-100 pt-3 space-y-2.5">
          <p className="text-xs font-semibold text-slate-500">{t('announce.history')}</p>
          {history.map((a) => (
            <div key={a.id}>
              <p dir="auto" className="text-sm text-slate-800 whitespace-pre-wrap break-words line-clamp-3 text-start">{a.body}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {formatRelative(a.created_at)} · {t('announce.reached', { delivered: a.delivered, total: a.recipients })}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
