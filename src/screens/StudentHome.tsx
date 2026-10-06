import { useEffect, useState, useCallback } from 'react';
import { PlayCircle, BookOpen, ArrowRight, GraduationCap } from 'lucide-react';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState, EmptyState } from '@/components/StateViews';
import { useUser } from '@/hooks/useUser';
import {
  fetchEnrolledCoursesWithProgress,
  fetchModulesWithLessons,
  fetchLessonProgress,
  findNextLesson,
  getAllLessonsOrdered,
} from '@/lib/courseService';
import type { Course, CourseProgress, Enrollment, Lesson, ModuleWithLessons } from '@/lib/types';

interface ContinueLearningData {
  course: Course;
  progress: CourseProgress;
  enrollment: Enrollment;
  nextLesson: Lesson | null;
  nextModuleTitle: string | null;
}

export function StudentHome({
  onOpenCourse,
  onOpenLesson,
}: {
  onOpenCourse: (courseId: string) => void;
  onOpenLesson: (courseId: string, lessonId: string) => void;
}) {
  const { user } = useUser();
  const [enrollments, setEnrollments] = useState<
    Array<{ course: Course; progress: CourseProgress; enrollment: Enrollment }>
  >([]);
  const [continueData, setContinueData] = useState<ContinueLearningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const enrolled = await fetchEnrolledCoursesWithProgress(user.id);
      setEnrollments(enrolled);

      if (enrolled.length > 0) {
        const mostRecent = enrolled[0];
        const modules = await fetchModulesWithLessons(mostRecent.course.id);
        const progress = await fetchLessonProgress(user.id, mostRecent.course.id);
        const completedSet = new Set(progress.filter((p) => p.completed).map((p) => p.lesson_id));
        const nextLesson = await findNextLesson(
          modules,
          completedSet,
          mostRecent.enrollment.last_lesson_id
        );

        let nextModuleTitle: string | null = null;
        if (nextLesson) {
          const mod = modules.find((m) => m.id === nextLesson.module_id);
          nextModuleTitle = mod?.title ?? null;
        }

        setContinueData({
          course: mostRecent.course,
          progress: mostRecent.progress,
          enrollment: mostRecent.enrollment,
          nextLesson,
          nextModuleTitle,
        });
      } else {
        setContinueData(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your courses');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingScreen message="Loading your courses..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="px-4 py-5 space-y-6">
      {/* Greeting */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
          {user?.first_name?.charAt(0).toUpperCase() ?? 'S'}
        </div>
        <div>
          <p className="text-sm text-slate-500">Welcome back,</p>
          <p className="text-xl font-bold text-slate-900">{user?.first_name}</p>
        </div>
      </div>

      {/* Continue Learning */}
      {continueData ? (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Continue Learning
          </h2>
          <Card
            className="p-5 bg-gradient-to-br from-blue-500 to-blue-600 border-blue-600"
            onClick={() => {
              if (continueData.nextLesson) {
                onOpenLesson(continueData.course.id, continueData.nextLesson.id);
              } else {
                onOpenCourse(continueData.course.id);
              }
            }}
          >
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="h-7 w-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-bold text-lg truncate">
                  {continueData.course.title}
                </h3>
                {continueData.nextLesson && continueData.nextModuleTitle ? (
                  <p className="text-blue-100 text-sm mt-0.5 truncate">
                    Next: {continueData.nextModuleTitle} — {continueData.nextLesson.title}
                  </p>
                ) : (
                  <p className="text-blue-100 text-sm mt-0.5">All caught up — review anytime</p>
                )}
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1">
                    <ProgressBar percent={continueData.progress.progress_percent} className="bg-blue-300/40" />
                  </div>
                  <span className="text-white text-sm font-semibold flex-shrink-0">
                    {continueData.progress.progress_percent}%
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-white font-medium text-sm">
                  <PlayCircle className="h-5 w-5" />
                  <span>{continueData.nextLesson ? 'Continue' : 'Review course'}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            Continue Learning
          </h2>
          <Card className="p-6 text-center">
            <EmptyState
              title="No courses yet"
              description="Browse available courses and start learning today."
              icon={<BookOpen className="h-7 w-7 text-slate-400" />}
            />
          </Card>
        </div>
      )}

      {/* My Courses */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          My Courses
        </h2>
        {enrollments.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-slate-500">
              You haven't enrolled in any courses yet.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {enrollments.map(({ course, progress }) => (
              <Card key={course.id} className="p-4" onClick={() => onOpenCourse(course.id)}>
                <div className="flex items-start gap-3">
                  <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="h-6 w-6 text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{course.title}</h3>
                    <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">
                      {course.description ?? 'No description'}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
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
                  </div>
                  <ArrowRight className="h-5 w-5 text-slate-300 flex-shrink-0 mt-1" />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
