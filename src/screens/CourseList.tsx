import { useEffect, useState, useCallback, useMemo } from 'react';
import { BookOpen, ArrowRight, Search, X } from 'lucide-react';
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
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { matchesSearch } from '@/lib/search';
import type { Course, CourseProgress } from '@/lib/types';

export function CourseList({ onOpenCourse }: { onOpenCourse: (courseId: string) => void }) {
  const { user } = useUser();
  const { t } = useI18n();
  const [courses, setCourses] = useState<Course[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, CourseProgress>>({});
  const [enrolledSet, setEnrolledSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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
      setError(errorMessage(err, t('courses.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [user, t]);

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

  const visibleCourses = useMemo(
    () => courses.filter((c) => matchesSearch(query, [c.title, c.description])),
    [courses, query]
  );

  if (loading) return <LoadingScreen message={t('courses.loading')} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="px-4 py-5 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('courses.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('courses.subtitle')}</p>
      </div>

      {/* Search: only useful once there are a few courses to look through. */}
      {courses.length > 3 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 start-3.5 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('courses.searchPh')}
            aria-label={t('courses.searchPh')}
            dir="auto"
            enterKeyHint="search"
            className="w-full ps-10 pe-10 py-3 rounded-xl border border-slate-200 bg-surface text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('courses.clearSearch')}
              className="absolute top-1/2 -translate-y-1/2 end-2 h-8 w-8 rounded-lg flex items-center justify-center hover:bg-slate-100"
            >
              <X className="h-4 w-4 text-slate-400" />
            </button>
          )}
        </div>
      )}

      {courses.length === 0 ? (
        <EmptyState
          title={t('courses.empty.title')}
          description={t('courses.empty.desc')}
          icon={<BookOpen className="h-7 w-7 text-slate-400" />}
        />
      ) : visibleCourses.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-10">
          {t('courses.noResults', { q: query.trim() })}
        </p>
      ) : (
        <div className="space-y-3">
          {visibleCourses.map((course) => {
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
                      <h3 dir="auto" className="font-semibold text-slate-900 text-left rtl:text-right">{course.title}</h3>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                        {course.description ?? t('common.noDescription')}
                      </p>
                      {progress && isEnrolled && (
                        <div className="mt-3 flex items-center gap-3">
                          <span className="text-xs text-slate-400">
                            {t('common.lessonsProgress', { done: progress.completed_lessons, total: progress.total_lessons })}
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
                          <span>{t('courses.enroll')}</span>
                          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
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

