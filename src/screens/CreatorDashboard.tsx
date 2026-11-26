import { useEffect, useState, useCallback } from 'react';
import { Plus, BookOpen, Users, Edit, Globe, GlobeLock, ArrowRight, FileText, Inbox } from 'lucide-react';
import { Card } from '@/components/Card';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState, EmptyState } from '@/components/StateViews';
import { useUser } from '@/hooks/useUser';
import {
  fetchCoursesByCreator,
  fetchModulesWithLessons,
  countEnrollmentsForCourse,
} from '@/lib/courseService';
import { countPendingImports } from '@/lib/importService';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import type { Course } from '@/lib/types';

interface CourseStats {
  moduleCount: number;
  lessonCount: number;
  studentCount: number;
}

export function CreatorDashboard({
  onEditCourse,
  onCreateCourse,
  onOpenImports,
  onOpenStudents,
}: {
  onEditCourse: (courseId: string) => void;
  onCreateCourse: () => void;
  onOpenImports: () => void;
  onOpenStudents: (courseId: string) => void;
}) {
  const { user } = useUser();
  const { t } = useI18n();
  const [pendingImports, setPendingImports] = useState(0);
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<Record<string, CourseStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const [myCourses, pending] = await Promise.all([
        fetchCoursesByCreator(user.id),
        // The badge is a convenience; never fail the dashboard because of it.
        countPendingImports(user.id).catch(() => 0),
      ]);
      setCourses(myCourses);
      setPendingImports(pending);

      const entries = await Promise.all(
        myCourses.map(async (course) => {
          const [modules, studentCount] = await Promise.all([
            fetchModulesWithLessons(course.id),
            countEnrollmentsForCourse(course.id),
          ]);
          const lessonCount = modules.reduce((sum, m) => sum + m.lessons.length, 0);
          return [course.id, { moduleCount: modules.length, lessonCount, studentCount }] as const;
        })
      );
      const statsMap: Record<string, CourseStats> = Object.fromEntries(entries);
      setStats(statsMap);
    } catch (err) {
      setError(errorMessage(err, t('dash.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingScreen message={t('dash.loading')} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="px-4 py-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('dash.title')}</h1>
          <p className="text-sm text-slate-500 mt-1">{t('dash.subtitle')}</p>
        </div>
        <button
          onClick={onCreateCourse}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 active:scale-95 transition-all shadow-sm"
        >
          <Plus className="h-5 w-5" />
          {t('dash.create')}
        </button>
      </div>

      <Card className="p-4" onClick={onOpenImports}>
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Inbox className="h-5 w-5 text-blue-500" />
            {pendingImports > 0 && (
              <span className="absolute -top-1.5 -end-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                {pendingImports > 99 ? '99+' : pendingImports}
              </span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900">{t('dash.inbox.title')}</p>
            <p className="text-xs text-slate-500 mt-0.5">{t('dash.inbox.pending', { n: pendingImports })}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-300 flex-shrink-0 rtl:rotate-180" />
        </div>
      </Card>

      {courses.length === 0 ? (
        <EmptyState
          title={t('dash.empty.title')}
          description={t('dash.empty.desc')}
          icon={<BookOpen className="h-7 w-7 text-slate-400" />}
          action={
            <button
              onClick={onCreateCourse}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 active:scale-95 transition-all"
            >
              <Plus className="h-5 w-5" />
              {t('dash.createCourse')}
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
                    <h3 dir="auto" className="font-semibold text-slate-900 truncate text-left rtl:text-right">{course.title}</h3>
                    <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">
                      {course.description ?? t('common.noDescription')}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {t('common.modulesCount', { n: s?.moduleCount ?? 0 })}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" />
                        {t('common.lessonsCount', { n: s?.lessonCount ?? 0 })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {t('common.studentsCount', { n: s?.studentCount ?? 0 })}
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
                          <><Globe className="h-3 w-3" /> {t('status.published')}</>
                        ) : (
                          <><GlobeLock className="h-3 w-3" /> {t('status.draft')}</>
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="px-2.5 py-1.5 rounded-lg text-slate-500 text-xs font-medium">
                      <Edit className="h-4 w-4" />
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-300 rtl:rotate-180" />
                  </div>
                </div>
                {/* The card itself opens the editor; this opens the students screen. */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenStudents(course.id);
                  }}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 pt-3 border-t border-slate-100 text-sm font-semibold text-blue-600 active:opacity-70"
                >
                  <Users className="h-4 w-4" />
                  {t('dash.students')}
                  <span className="text-xs font-medium text-slate-400 tabular-nums">({s?.studentCount ?? 0})</span>
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
