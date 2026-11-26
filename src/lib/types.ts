export type UserRole = 'student' | 'creator';

export interface User {
  id: string;
  telegram_id: number;
  username: string | null;
  first_name: string;
  photo_url: string | null;
  role: UserRole;
  created_at: string;
}

export type CourseStatus = 'draft' | 'published';

export interface Course {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: CourseStatus;
  slug: string | null;
  /** Bot sends this course's files with Telegram's protect_content (no forwarding/saving). */
  protect_content: boolean;
  created_at: string;
  updated_at: string;
}

export interface Module {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  position: number;
  created_at: string;
}

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  content: string | null;
  telegram_url: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  // Telegram file attached on import (served by the lesson-media function).
  media_type: LessonMediaType | null;
  media_kind: TelegramFileKind | null;
  media_file_id: string | null;
  media_file_name: string | null;
  media_mime_type: string | null;
  media_file_size: number | null;
  /** Telegram preview image (video frame, PDF first page, ...). */
  media_thumb_file_id: string | null;
  /** Seconds, for video and audio. */
  media_duration: number | null;
}

/** Exact Telegram object type of a file_id; decides how the bot can resend it. */
export type TelegramFileKind = 'photo' | 'video' | 'video_note' | 'animation' | 'document' | 'audio' | 'voice';
export type LessonMediaType = 'video' | 'pdf' | 'image' | 'file' | 'audio';

export type ResourceType = 'pdf' | 'file' | 'link' | 'telegram';

export interface Resource {
  id: string;
  lesson_id: string;
  title: string;
  type: ResourceType;
  url: string;
  description: string | null;
  created_at: string;
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  last_lesson_id: string | null;
  last_activity_at: string;
  created_at: string;
}

export interface LessonProgress {
  id: string;
  user_id: string;
  course_id: string;
  lesson_id: string;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseWithCreator extends Course {
  creator?: Pick<User, 'id' | 'first_name' | 'username'>;
}

export interface ModuleWithLessons extends Module {
  lessons: Lesson[];
}

export interface CourseProgress {
  total_lessons: number;
  completed_lessons: number;
  progress_percent: number;
}

export type LessonState = 'not_started' | 'in_progress' | 'completed';

export type ImportMediaType = 'video' | 'pdf' | 'text' | 'link' | 'image' | 'file' | 'audio';
export type ImportStatus = 'pending' | 'imported';

export interface ImportedMessage {
  id: string;
  creator_id: string;
  telegram_message_id: number;
  raw_content: string | null;
  parsed_title: string | null;
  media_type: ImportMediaType;
  media_url: string | null;
  file_id: string | null;
  file_kind: TelegramFileKind | null;
  file_name: string | null;
  file_mime_type: string | null;
  file_size: number | null;
  thumb_file_id: string | null;
  duration: number | null;
  status: ImportStatus;
  created_at: string;
}
