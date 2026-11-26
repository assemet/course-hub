import { useEffect, useRef, useState } from 'react';
import { Video, FileText, Music, File as FileIcon, Image as ImageIcon, Link as LinkIcon, Type, Play } from 'lucide-react';
import { loadThumbnail, formatDuration, type ThumbSource } from '@/lib/mediaService';
import type { ImportMediaType } from '@/lib/types';

const icons: Record<ImportMediaType, typeof FileText> = {
  video: Video,
  pdf: FileText,
  audio: Music,
  image: ImageIcon,
  file: FileIcon,
  link: LinkIcon,
  text: Type,
};

const tints: Record<ImportMediaType, string> = {
  video: 'bg-red-50 text-red-500',
  pdf: 'bg-orange-50 text-orange-500',
  audio: 'bg-purple-50 text-purple-500',
  image: 'bg-blue-50 text-blue-500',
  file: 'bg-teal-50 text-teal-500',
  link: 'bg-blue-50 text-blue-500',
  text: 'bg-slate-100 text-slate-500',
};

/** Loads `source`'s thumbnail once the element is (nearly) on screen. */
function useLazyThumb(source: ThumbSource | null) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const key = source ? ('lessonId' in source ? `l:${source.lessonId}` : `i:${source.importId}`) : null;

  useEffect(() => {
    setSrc(null);
    if (!key || !source || !ref.current) return;
    let cancelled = false;
    const load = () => loadThumbnail(source).then((url) => !cancelled && setSrc(url));

    if (!('IntersectionObserver' in window)) {
      load();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(ref.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
    // `key` identifies the source; the object itself is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { ref, src };
}

/**
 * Preview of a lesson's (or an imported post's) attachment: the Telegram
 * thumbnail when there is one, otherwise an icon for the media type. Videos get
 * a play mark, videos and audio show their duration.
 */
export function MediaThumb({
  source,
  mediaType,
  hasThumb,
  duration,
  className = 'h-12 w-12',
  iconClassName = 'h-5 w-5',
  showPlay = true,
  fit = 'cover',
}: {
  source: ThumbSource;
  mediaType: ImportMediaType;
  hasThumb: boolean;
  duration?: number | null;
  /** Size and shape of the box, e.g. "h-12 w-16 rounded-lg". */
  className?: string;
  iconClassName?: string;
  showPlay?: boolean;
  /** `contain` keeps whole pages visible (PDF previews). */
  fit?: 'cover' | 'contain';
}) {
  const { ref, src } = useLazyThumb(hasThumb ? source : null);
  const Icon = icons[mediaType] ?? FileIcon;
  const time = mediaType === 'video' || mediaType === 'audio' ? formatDuration(duration) : null;

  return (
    <div
      ref={ref}
      className={`relative flex-shrink-0 overflow-hidden rounded-xl flex items-center justify-center ${
        src ? 'bg-slate-100' : tints[mediaType] ?? tints.file
      } ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className={`absolute inset-0 h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
        />
      ) : (
        <Icon className={iconClassName} />
      )}

      {src && mediaType === 'video' && showPlay && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="h-[28%] max-h-14 min-h-7 aspect-square rounded-full bg-black/50 flex items-center justify-center">
            <Play className="h-1/2 w-1/2 text-white fill-white ml-[8%]" />
          </span>
        </span>
      )}

      {time && (
        <span
          dir="ltr"
          className="absolute bottom-1 end-1 rounded bg-black/60 px-1 text-[10px] font-semibold leading-4 text-white tabular-nums"
        >
          {time}
        </span>
      )}
    </div>
  );
}
