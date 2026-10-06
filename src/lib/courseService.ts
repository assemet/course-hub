import { supabase } from './supabase';
import type {
  Course, Module, Lesson, Resource, Enrollment, LessonProgress,
  ModuleWithLessons, CourseProgress,
} from './types';

export async function fetchPublishedCourses(): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Course[];
}

export async function fetchCoursesByCreator(creatorId: string): Promise<Course[]> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Course[];
}

export async function fetchCourseById(courseId: string): Promise<Course | null> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId)
    .maybeSingle();
  if (error) throw error;
  return data as Course | null;
}

export async function fetchCourseBySlug(slug: string): Promise<Course | null> {
  const { data, error } = await supabase
    .from('courses')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data as Course | null;
}

export async function fetchModulesWithLessons(courseId: string): Promise<ModuleWithLessons[]> {
  const { data: modules, error: mErr } = await supabase
    .from('modules')
    .select('*')
    .eq('course_id', courseId)
    .order('position', { ascending: true });
  if (mErr) throw mErr;

  const moduleIds = (modules as Module[]).map((m) => m.id);
  if (moduleIds.length === 0) return [];

  const { data: lessons, error: lErr } = await supabase
    .from('lessons')
    .select('*')
    .in('module_id', moduleIds)
    .order('position', { ascending: true });
  if (lErr) throw lErr;

  return (modules as Module[]).map((m) => ({
    ...m,
    lessons: (lessons as Lesson[]).filter((l) => l.module_id === m.id),
  }));
}

export async function fetchResourcesByLesson(lessonId: string): Promise<Resource[]> {
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as Resource[];
}

export async function fetchEnrollments(userId: string): Promise<Enrollment[]> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('*')
    .eq('user_id', userId)
    .order('last_activity_at', { ascending: false });
  if (error) throw error;
  return data as Enrollment[];
}

export async function fetchEnrollment(userId: string, courseId: string): Promise<Enrollment | null> {
  const { data, error } = await supabase
    .from('enrollments')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();
  if (error) throw error;
  return data as Enrollment | null;
}

export async function createEnrollment(userId: string, courseId: string): Promise<Enrollment> {
  const { data: existing } = await supabase
    .from('enrollments')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .maybeSingle();
  if (existing) return existing as Enrollment;

  const { data, error } = await supabase
    .from('enrollments')
    .insert({ user_id: userId, course_id: courseId })
    .select()
    .single();
  if (error) throw error;
  return data as Enrollment;
}

export async function fetchLessonProgress(userId: string, courseId: string): Promise<LessonProgress[]> {
  const { data, error } = await supabase
    .from('lesson_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId);
  if (error) throw error;
  return data as LessonProgress[];
}

export function calculateProgress(
  modules: ModuleWithLessons[],
  progress: LessonProgress[]
): CourseProgress {
  const totalLessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);
  const completedSet = new Set(progress.filter((p) => p.completed).map((p) => p.lesson_id));
  const completedLessons = modules.reduce(
    (sum, m) => sum + m.lessons.filter((l) => completedSet.has(l.id)).length,
    0
  );
  const progressPercent = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);
  return { total_lessons: totalLessons, completed_lessons: completedLessons, progress_percent: progressPercent };
}

export async function markLessonComplete(
  userId: string,
  courseId: string,
  lessonId: string
): Promise<void> {
  const { data: existing } = await supabase
    .from('lesson_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lesson_id', lessonId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from('lesson_progress')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('lesson_progress')
      .insert({
        user_id: userId,
        course_id: courseId,
        lesson_id: lessonId,
        completed: true,
        completed_at: new Date().toISOString(),
      });
    if (error) throw error;
  }

  await updateLastLesson(userId, courseId, lessonId);
}

export async function updateLastLesson(
  userId: string,
  courseId: string,
  lessonId: string
): Promise<void> {
  const { error } = await supabase
    .from('enrollments')
    .update({ last_lesson_id: lessonId, last_activity_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('course_id', courseId);
  if (error) throw error;
}

export async function getCourseProgressForUser(
  userId: string,
  courseId: string
): Promise<CourseProgress> {
  const modules = await fetchModulesWithLessons(courseId);
  const progress = await fetchLessonProgress(userId, courseId);
  return calculateProgress(modules, progress);
}

export function getAllLessonsOrdered(modules: ModuleWithLessons[]): Lesson[] {
  return modules.flatMap((m) => m.lessons);
}

export function getLessonState(
  lessonId: string,
  completedSet: Set<string>,
  lastLessonId: string | null,
  allLessons: Lesson[]
): 'not_started' | 'in_progress' | 'completed' {
  if (completedSet.has(lessonId)) return 'completed';
  if (lastLessonId === lessonId) return 'in_progress';
  // If there's a last lesson and this lesson comes right after it, it's "next" = in progress concept
  return 'not_started';
}

export async function findNextLesson(
  modules: ModuleWithLessons[],
  completedSet: Set<string>,
  lastLessonId: string | null
): Promise<Lesson | null> {
  const allLessons = getAllLessonsOrdered(modules);
  if (allLessons.length === 0) return null;

  if (lastLessonId) {
    const idx = allLessons.findIndex((l) => l.id === lastLessonId);
    if (idx >= 0 && idx + 1 < allLessons.length) {
      return allLessons[idx + 1];
    }
  }

  // Find first uncompleted lesson
  const firstUncompleted = allLessons.find((l) => !completedSet.has(l.id));
  if (firstUncompleted) return firstUncompleted;

  // All completed — return last lesson
  return allLessons[allLessons.length - 1];
}

export async function fetchEnrolledCoursesWithProgress(userId: string): Promise<
  Array<{
    course: Course;
    progress: CourseProgress;
    enrollment: Enrollment;
  }>
> {
  const enrollments = await fetchEnrollments(userId);
  if (enrollments.length === 0) return [];

  const courseIds = enrollments.map((e) => e.course_id);
  const { data: courses, error } = await supabase
    .from('courses')
    .select('*')
    .in('id', courseIds)
    .eq('status', 'published');
  if (error) throw error;

  const result: Array<{ course: Course; progress: CourseProgress; enrollment: Enrollment }> = [];
  for (const enrollment of enrollments) {
    const course = (courses as Course[]).find((c) => c.id === enrollment.course_id);
    if (!course) continue;
    const progress = await getCourseProgressForUser(userId, course.id);
    result.push({ course, progress, enrollment });
  }

  // Sort by last activity descending
  result.sort((a, b) =>
    new Date(b.enrollment.last_activity_at).getTime() - new Date(a.enrollment.last_activity_at).getTime()
  );

  return result;
}

export async function fetchCreatorName(creatorId: string): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .select('first_name, username')
    .eq('id', creatorId)
    .maybeSingle();
  if (error || !data) return 'Unknown';
  return (data as { first_name: string; username: string | null }).first_name;
}

export async function countEnrollmentsForCourse(courseId: string): Promise<number> {
  const { count, error } = await supabase
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('course_id', courseId);
  if (error) throw error;
  return count ?? 0;
}
