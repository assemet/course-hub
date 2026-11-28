import { BookOpenText } from 'lucide-react';
import { MediaThumb } from '@/components/MediaThumb';
import { courseTheme } from '@/lib/courseTheme';
import type { Lesson } from '@/lib/types';

/**
 * A lesson's tile in lists: the Telegram preview of its file when it has one
 * (or the file type's icon), and for lessons written as text only, a tile in
 * the course cover's colors so every row still has a picture.
 */
export function LessonThumb({
  lesson,
  courseId,
  className = 'h-11 w-16 rounded-lg',
  iconClassName = 'h-5 w-5',
  withDuration = false,
}: {
  lesson: Pick<Lesson, 'id' | 'media_type' | 'media_thumb_file_id' | 'media_duration'>;
  courseId: string;
  className?: string;
  iconClassName?: string;
  /** Shows the video/audio length on the tile (lists that don't print it elsewhere). */
  withDuration?: boolean;
}) {
  if (lesson.media_type) {
    return (
      <MediaThumb
        source={{ lessonId: lesson.id }}
        mediaType={lesson.media_type}
        hasThumb={!!lesson.media_thumb_file_id}
        duration={withDuration ? lesson.media_duration : null}
        className={className}
        iconClassName={iconClassName}
      />
    );
  }

  const theme = courseTheme(courseId);
  return (
    <div
      aria-hidden="true"
      className={`relative flex-shrink-0 overflow-hidden flex items-center justify-center ${className}`}
      style={{ background: theme.bg }}
    >
      <div
        className="absolute rounded-full"
        style={{ width: '60%', aspectRatio: '1', background: theme.shape, bottom: '-30%', left: '-12%' }}
      />
      <BookOpenText className={`relative ${iconClassName}`} style={{ color: theme.text }} />
    </div>
  );
}
