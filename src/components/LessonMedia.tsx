import { useEffect, useState } from 'react';
import { Video, FileText, Music, File as FileIcon, Send, CheckCircle2, AlertCircle, MessageCircle } from 'lucide-react';
import { Card } from '@/components/Card';
import { useI18n, type TKey } from '@/lib/i18n';
import { loadLessonImage, sendLessonMediaToChat, formatFileSize, formatDuration, splitFileName } from '@/lib/mediaService';
import { hapticFeedback, openTelegramLink, requestBotWriteAccess } from '@/lib/telegram';
import { buildBotChatLink } from '@/lib/deepLink';
import { MediaThumb } from '@/components/MediaThumb';
import type { Lesson, LessonMediaType } from '@/lib/types';

const typeIcons: Record<LessonMediaType, typeof FileText> = {
  video: Video,
  pdf: FileText,
  audio: Music,
  image: FileIcon,
  file: FileIcon,
};

const typeColors: Record<LessonMediaType, string> = {
  video: 'bg-red-50 text-red-500',
  pdf: 'bg-orange-50 text-orange-500',
  audio: 'bg-purple-50 text-purple-500',
  image: 'bg-blue-50 text-blue-500',
  file: 'bg-teal-50 text-teal-500',
};

const typeLabels: Record<LessonMediaType, TKey> = {
  video: 'media.video',
  pdf: 'media.pdf',
  audio: 'media.audio',
  image: 'media.image',
  file: 'media.file',
};

type SendState = 'idle' | 'sending' | 'sent' | 'needs_access' | 'failed';

/** Sends the file to the user's chat with the bot, asking for permission if needed. */
function useSendToChat(lessonId: string) {
  const [state, setState] = useState<SendState>('idle');

  const send = async () => {
    setState('sending');
    let result = await sendLessonMediaToChat(lessonId);
    if (result === 'chat_unavailable' && (await requestBotWriteAccess())) {
      result = await sendLessonMediaToChat(lessonId);
    }
    if (result === 'sent') {
      hapticFeedback('success');
      setState('sent');
    } else {
      hapticFeedback('error');
      setState(result === 'chat_unavailable' ? 'needs_access' : 'failed');
    }
  };

  return { state, send };
}

function SendStatus({ state }: { state: SendState }) {
  const { t } = useI18n();
  if (state === 'sent') {
    return (
      <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-green-50 px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          {t('lessonMedia.sent')}
        </span>
        <button
          onClick={() => openTelegramLink(buildBotChatLink())}
          className="flex items-center gap-1 text-xs font-semibold text-green-700 underline-offset-2 hover:underline flex-shrink-0"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {t('lessonMedia.openChat')}
        </button>
      </div>
    );
  }
  if (state === 'needs_access' || state === 'failed') {
    return (
      <div role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
        <p className="flex items-start gap-1.5">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          {state === 'needs_access' ? t('lessonMedia.needsAccess') : t('lessonMedia.failed')}
        </p>
        {state === 'needs_access' && (
          <button
            onClick={() => openTelegramLink(buildBotChatLink())}
            className="mt-2 text-xs font-semibold text-red-700 underline"
          >
            {t('inbox.openBot')}
          </button>
        )}
      </div>
    );
  }
  return null;
}

function SendButton({ state, onSend, label }: { state: SendState; onSend: () => void; label: string }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onSend}
      disabled={state === 'sending'}
      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 active:scale-[0.98] disabled:opacity-60 transition-all"
    >
      {state === 'sending' ? (
        <>
          <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          {t('lessonMedia.sending')}
        </>
      ) : (
        <>
          <Send className="h-4 w-4 rtl:-scale-x-100" />
          {label}
        </>
      )}
    </button>
  );
}

function LessonImage({ lesson, protect }: { lesson: Lesson; protect: boolean }) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const { state, send } = useSendToChat(lesson.id);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    loadLessonImage(lesson.id)
      .then((url) => {
        if (cancelled) URL.revokeObjectURL(url);
        else setSrc((objectUrl = url));
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [lesson.id]);

  // Too big or unavailable to show inline: offer it like any other file.
  if (failed) return <LessonFile lesson={lesson} protect={protect} note={t('lessonMedia.imageFailed')} />;

  return (
    <div>
      {src ? (
        <img
          src={src}
          alt={lesson.title}
          // Protected courses: no long-press "save image" / drag-out. Screenshots
          // can't be blocked from a web page, so this only removes the easy path.
          draggable={!protect}
          onContextMenu={protect ? (e) => e.preventDefault() : undefined}
          className={`w-full rounded-2xl border border-slate-100 bg-slate-50 ${
            protect ? 'select-none [-webkit-touch-callout:none]' : ''
          }`}
        />
      ) : (
        <div className="w-full aspect-video rounded-2xl bg-slate-100 animate-pulse" />
      )}
      {/* Sending an image to save it makes no sense when the course forbids saving. */}
      {!protect && (
        <>
          <button
            onClick={send}
            disabled={state === 'sending'}
            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-blue-600 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5 rtl:-scale-x-100" />
            {state === 'sending' ? t('lessonMedia.sending') : t('lessonMedia.saveImage')}
          </button>
          <SendStatus state={state} />
        </>
      )}
    </div>
  );
}

function LessonFile({ lesson, protect, note, showHint = true }: { lesson: Lesson; protect: boolean; note?: string; showHint?: boolean }) {
  const { t } = useI18n();
  const { state, send } = useSendToChat(lesson.id);
  const type = lesson.media_type ?? 'file';
  const Icon = typeIcons[type];
  const size = formatFileSize(lesson.media_file_size);
  const { base, ext } = splitFileName(lesson.media_file_name);
  const typeLabel = t(typeLabels[type]);
  const duration = type === 'video' || type === 'audio' ? formatDuration(lesson.media_duration) : null;
  // Type, extension (when it adds something), duration and size, each isolated for bidi.
  const details = [typeLabel, ext && ext !== typeLabel ? ext : null, duration, size].filter(Boolean) as string[];
  const hasPreview = !!lesson.media_thumb_file_id && (type === 'video' || type === 'pdf' || type === 'file');

  return (
    <Card className="p-4">
      {hasPreview && (
        // Tapping the preview does the same as the button: the file goes to the chat.
        <button
          onClick={send}
          disabled={state === 'sending'}
          aria-label={t('lessonMedia.sendToChat')}
          className="block w-full mb-4 active:scale-[0.99] transition-transform"
        >
          <MediaThumb
            source={{ lessonId: lesson.id }}
            mediaType={type}
            hasThumb
            duration={type === 'video' ? lesson.media_duration : null}
            fit={type === 'video' ? 'cover' : 'contain'}
            className={type === 'video' ? 'w-full aspect-video rounded-xl' : 'w-full h-56 rounded-xl'}
            iconClassName="h-10 w-10"
          />
        </button>
      )}
      <div className="flex items-center gap-3">
        {/* With a preview above, the type icon would only repeat it. */}
        {!hasPreview && (
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${typeColors[type]}`}>
            <Icon className="h-6 w-6" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {(base || !hasPreview) && (
            <p dir="auto" className="text-sm font-semibold text-slate-900 truncate text-left rtl:text-right">
              {base ?? typeLabel}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
            {details.map((d, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true">·</span>}
                <bdi>{d}</bdi>
              </span>
            ))}
          </p>
        </div>
      </div>
      {note && <p className="text-xs text-slate-400 mt-3">{note}</p>}
      {showHint ? (
        <p className="text-xs text-slate-500 mt-3 mb-3">
          {protect ? t('lessonMedia.hintProtected') : t('lessonMedia.hint')}
        </p>
      ) : (
        <div className="h-3" />
      )}
      <SendButton
        state={state}
        onSend={send}
        label={t(type === 'video' ? 'lessonMedia.watch' : type === 'audio' ? 'lessonMedia.listen' : 'lessonMedia.open')}
      />
      <SendStatus state={state} />
    </Card>
  );
}

/** The Telegram file attached to a lesson, if any. */
export function LessonMedia({ lesson, protect, showHint = true }: { lesson: Lesson; protect: boolean; showHint?: boolean }) {
  if (!lesson.media_file_id || !lesson.media_type) return null;
  return lesson.media_type === 'image'
    ? <LessonImage lesson={lesson} protect={protect} />
    : <LessonFile lesson={lesson} protect={protect} showHint={showHint} />;
}
