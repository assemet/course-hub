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
}

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
