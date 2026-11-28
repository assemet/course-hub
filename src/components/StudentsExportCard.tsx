import { useState } from 'react';
import { FileSpreadsheet, Send, CheckCircle2, MessageCircle } from 'lucide-react';
import { Card } from '@/components/Card';
import { useI18n } from '@/lib/i18n';
import { exportStudentsToChat } from '@/lib/insightsService';
import { hapticFeedback, openTelegramLink, requestBotWriteAccess } from '@/lib/telegram';
import { buildBotChatLink } from '@/lib/deepLink';

type State = 'idle' | 'sending' | 'sent' | 'needs_access' | 'failed';

/** Creator: get the course's students and progress as an Excel file in the bot chat. */
export function StudentsExportCard({ courseId }: { courseId: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<State>('idle');

  const handleExport = async () => {
    setState('sending');
    let result = await exportStudentsToChat(courseId);
    // The bot can't write to someone who never started it: ask once, then retry.
    if (result === 'chat_unavailable' && (await requestBotWriteAccess())) {
      result = await exportStudentsToChat(courseId);
    }
    setState(result === 'sent' ? 'sent' : result === 'chat_unavailable' ? 'needs_access' : 'failed');
    hapticFeedback(result === 'sent' ? 'success' : 'error');
  };

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0">
          <FileSpreadsheet className="h-5 w-5 text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{t('export.title')}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t('export.desc')}</p>
        </div>
      </div>

      {state === 'sent' ? (
        <div role="status" className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-green-50 px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> {t('export.sent')}
          </span>
          <button
            onClick={() => openTelegramLink(buildBotChatLink())}
            className="flex items-center gap-1 text-xs font-semibold text-green-700 flex-shrink-0"
          >
            <MessageCircle className="h-3.5 w-3.5" /> {t('lessonMedia.openChat')}
          </button>
        </div>
      ) : (
        <button
          onClick={handleExport}
          disabled={state === 'sending'}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-green-600/30 bg-green-50 text-green-700 text-sm font-semibold disabled:opacity-60 active:scale-[0.98] transition-all"
        >
          <Send className="h-4 w-4 rtl:-scale-x-100" />
          {state === 'sending' ? t('export.sending') : t('export.button')}
        </button>
      )}

      {(state === 'needs_access' || state === 'failed') && (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state === 'needs_access' ? t('lessonMedia.needsAccess') : t('export.failed')}
        </p>
      )}
    </Card>
  );
}
