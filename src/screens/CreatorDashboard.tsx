import { useEffect, useState, useCallback } from 'react';
import { Plus, BookOpen, Users, Edit, Globe, GlobeLock, ArrowRight, FileText } from 'lucide-react';
import { Card } from '@/components/Card';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState, EmptyState } from '@/components/StateViews';
import { useUser } from '@/hooks/useUser';
import {
  fetchCoursesByCreator,
  fetchModulesWithLessons,
  countEnrollmentsForCourse,
} from '@/lib/courseService';
import type { Course } from '@/lib/types';

interface CourseStats {
  moduleCount: number;
  lessonCount: number;
  studentCount: number;
}

export function CreatorDashboard({
  onEditCourse,
  onCreateCourse,
}: {
  onEditCourse: (courseId: string) => void;
  onCreateCourse: () => void;
}) {
  const { user } = useUser();
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<Record<string, CourseStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const myCourses = await fetchCoursesByCreator(user.id);
      setCourses(myCourses);

      const statsMap: Record<string, CourseStats> = {};
      for (const course of myCourses) {
        const modules = await fetchModulesWithLessons(course.id);
        const lessonCount = modules.reduce((sum, m) => sum + m.lessons.length, 0);
        const studentCount = await countEnrollmentsForCourse(course.id);
        statsMap[course.id] = {
          moduleCount: modules.length,
          lessonCount,
          studentCount,
        };
      }
      setStats(statsMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingScreen message="Loading dashboard..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="px-4 py-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your courses</p>
        </div>
        <button
          onClick={onCreateCourse}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 active:scale-95 transition-all shadow-sm"
        >
          <Plus className="h-5 w-5" />
          Create
        </button>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          title="No courses yet"
          description="Create your first course to get started."
          icon={<BookOpen className="h-7 w-7 text-slate-400" />}
          action={
            <button
              onClick={onCreateCourse}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 active:scale-95 transition-all"
            >
              <Plus className="h-5 w-5" />
              Create Course
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {courses.map((course) => {
            const s = stats[course.id];
            const isPublished = course.status === 'published';
            return (
              <Card key={course.id} className="p-4" onClick={() => onEditCourse(course.id)}>
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="h-6 w-6 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{course.title}</h3>
                    <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">
                      {course.description ?? 'No description'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {s?.moduleCount ?? 0} modules
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {s?.lessonCount ?? 0} lessons
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {s?.studentCount ?? 0} students
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          isPublished
                            ? 'bg-green-50 text-green-600'
                            : 'bg-amber-50 text-amber-600'
                        }`}
                      >
                        {isPublished ? (
                          <><Globe className="h-3 w-3" /> Published</>
                        ) : (
                          <><GlobeLock className="h-3 w-3" /> Draft</>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="px-2.5 py-1.5 rounded-lg text-slate-500 text-xs font-medium">
                      <Edit className="h-4 w-4" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300" />
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
