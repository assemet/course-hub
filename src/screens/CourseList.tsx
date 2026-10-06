import { useEffect, useState, useCallback } from 'react';
import { BookOpen, ArrowRight } from 'lucide-react';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState, EmptyState } from '@/components/StateViews';
import { useUser } from '@/hooks/useUser';
import {
  fetchPublishedCourses,
  fetchEnrollments,
  fetchModulesWithLessons,
  fetchLessonProgress,
  calculateProgress,
  createEnrollment,
} from '@/lib/courseService';
import type { Course, CourseProgress } from '@/lib/types';

export function CourseList({ onOpenCourse }: { onOpenCourse: (courseId: string) => void }) {
  const { user } = useUser();
  const [courses, setCourses] = useState<Course[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, CourseProgress>>({});
  const [enrolledSet, setEnrolledSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const [published, enrollments] = await Promise.all([
        fetchPublishedCourses(),
        fetchEnrollments(user.id),
      ]);
      setCourses(published);
      const enrolledIds = new Set(enrollments.map((e) => e.course_id));
      setEnrolledSet(enrolledIds);

      const progressEntries: Record<string, CourseProgress> = {};
      for (const course of published) {
        const modules = await fetchModulesWithLessons(course.id);
        const lp = await fetchLessonProgress(user.id, course.id);
        progressEntries[course.id] = calculateProgress(modules, lp);
      }
      setProgressMap(progressEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleOpen = async (courseId: string) => {
    if (!user) return;
    if (!enrolledSet.has(courseId)) {
      try {
        await createEnrollment(user.id, courseId);
      } catch {
        // enrollment may already exist due to race
      }
    }
    onOpenCourse(courseId);
  };

  if (loading) return <LoadingScreen message="Loading courses..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="px-4 py-5 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Courses</h1>
        <p className="text-sm text-slate-500 mt-1">Browse and enroll in available courses</p>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          title="No courses available"
          description="Check back later for new courses."
          icon={<BookOpen className="h-7 w-7 text-slate-400" />}
        />
      ) : (
        <div className="space-y-3">
          {courses.map((course) => {
            const progress = progressMap[course.id];
            const isEnrolled = enrolledSet.has(course.id);
            return (
              <Card key={course.id} className="overflow-hidden" onClick={() => handleOpen(course.id)}>
                {course.cover_url && (
                  <div className="h-32 bg-slate-100 overflow-hidden">
                    <img
                      src={course.cover_url}
                      alt={course.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {!course.cover_url && (
                      <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="h-6 w-6 text-blue-500" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900">{course.title}</h3>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                        {course.description ?? 'No description'}
                      </p>
                      {progress && isEnrolled && (
                        <div className="mt-3 flex items-center gap-3">
                          <span className="text-xs text-slate-400">
                            {progress.completed_lessons}/{progress.total_lessons} lessons
                          </span>
                          <div className="flex-1">
                            <ProgressBar percent={progress.progress_percent} />
                          </div>
                          <span className="text-xs font-semibold text-slate-600 flex-shrink-0">
                            {progress.progress_percent}%
                          </span>
                        </div>
                      )}
                      {!isEnrolled && (
                        <div className="mt-3 flex items-center gap-1.5 text-blue-500 text-sm font-medium">
                          <span>Enroll & start</span>
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

