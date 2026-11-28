import { useEffect, useState, useCallback } from 'react';
import { Plus, BookOpen, Users, Edit, Globe, GlobeLock, ArrowRight, FileText, Inbox, TrendingDown } from 'lucide-react';
import { CourseCover } from '@/components/CourseCover';
import { OnboardingChecklist } from '@/components/OnboardingChecklist';
import { isOnboardingDismissed, dismissOnboarding } from '@/lib/onboarding';
import { buildBotChatLink } from '@/lib/deepLink';
import { openTelegramLink } from '@/lib/telegram';
import { fetchCourseStudents, isInactive, type CourseStudent } from '@/lib/insightsService';
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
  /** null when the student list couldn't be loaded (the numbers above still show). */
  students: CourseStudent[] | null;
}

const WEEK = 7 * 24 * 3_600_000;

/** Totals across all courses, for the numbers at the top of the dashboard. */
function summarize(courses: Course[], stats: Record<string, CourseStats>) {
  const students = new Set<string>();
  const activeThisWeek = new Set<string>();
  let enrollments = 0;
  let finished = 0;
  const inactive = new Set<string>();
  let mostInactive: { courseId: string; count: number } | null = null;
  const now = Date.now();
  for (const course of courses) {
    const s = stats[course.id];
    if (!s?.students) continue;
    let courseInactive = 0;
    for (const st of s.students) {
      students.add(st.user_id);
      enrollments++;
      if (now - new Date(st.last_activity_at).getTime() < WEEK) activeThisWeek.add(st.user_id);
      const done = s.lessonCount > 0 && st.completed_lessons >= s.lessonCount;
      if (done) finished++;
      else if (isInactive(st, now)) {
        courseInactive++;
        inactive.add(st.user_id);
      }
    }
    if (courseInactive > 0 && (!mostInactive || courseInactive > mostInactive.count)) {
      mostInactive = { courseId: course.id, count: courseInactive };
    }
  }
  return {
    students: students.size,
    activeThisWeek: activeThisWeek.size,
    completionRate: enrollments > 0 ? Math.round((finished / enrollments) * 100) : 0,
    inactive: inactive.size,
    mostInactiveCourseId: mostInactive?.courseId ?? null,
  };
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
  const [onboardingDismissed, setOnboardingDismissed] = useState(isOnboardingDismissed);
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
          const [modules, students] = await Promise.all([
            fetchModulesWithLessons(course.id),
            fetchCourseStudents(course.id).catch(() => null),
          ]);
          // Fall back to a plain count if the student list is unavailable.
          const studentCount = students ? students.length : await countEnrollmentsForCourse(course.id);
          const lessonCount = modules.reduce((sum, m) => sum + m.lessons.length, 0);
          return [course.id, { moduleCount: modules.length, lessonCount, studentCount, students }] as const;
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

  const totals = summarize(courses, stats);
  const hasStudentData = courses.some((c) => stats[c.id]?.students);
  const hasLessons = courses.some((c) => (stats[c.id]?.lessonCount ?? 0) > 0);
  const onboarding = {
    hasCourse: courses.length > 0,
    hasImports: pendingImports > 0 || hasLessons,
    hasLessons,
    hasPublished: courses.some((c) => c.status === 'published' && (stats[c.id]?.lessonCount ?? 0) > 0),
  };
  const showOnboarding = !onboardingDismissed && !Object.values(onboarding).every(Boolean);

  return (
    <div className="px-4 py-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p dir="auto" className="text-sm text-slate-500 text-start">{t('dash.hello', { name: user?.first_name ?? '' })}</p>
          <h1 className="text-2xl font-bold text-slate-900">{t('dash.title')}</h1>
        </div>
        <button
          onClick={onCreateCourse}
          className="flex items-center gap-1.5 h-11 px-4 rounded-2xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 active:scale-95 transition-all shadow-sm"
        >
          <Plus className="h-5 w-5" />
          {t('dash.create')}
        </button>
      </div>

      {showOnboarding && (
        <OnboardingChecklist
          progress={onboarding}
          onCreateCourse={onCreateCourse}
          onOpenBot={() => openTelegramLink(buildBotChatLink())}
          onOpenImports={onOpenImports}
          // The course to publish: one with lessons if there is one.
          onOpenCourse={() => {
            const target = courses.find((c) => (stats[c.id]?.lessonCount ?? 0) > 0) ?? courses[0];
            if (target) onEditCourse(target.id);
          }}
          onDismiss={() => {
            dismissOnboarding();
            setOnboardingDismissed(true);
          }}
        />
      )}

      {/* Only once there are students: a row of zeros is noise while setting up. */}
      {hasStudentData && totals.students > 0 && (
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-[18px] bg-[#0B2463] dark:bg-[#172B63] px-3 py-3.5 text-white">
            <p className="text-2xl font-bold tabular-nums">{totals.students}</p>
            <p className="text-xs text-[#C6D2EE]">{t('dash.kpi.students', { n: totals.students })}</p>
          </div>
          <div className="rounded-[18px] bg-surface px-3 py-3.5 shadow-[0_1px_3px_rgba(11,36,99,0.06)]">
            <p className="text-2xl font-bold tabular-nums text-slate-900">{totals.activeThisWeek}</p>
            <p className="text-xs text-slate-500">{t('dash.kpi.active')}</p>
          </div>
          <div className="rounded-[18px] bg-surface px-3 py-3.5 shadow-[0_1px_3px_rgba(11,36,99,0.06)]">
            <p className="text-2xl font-bold tabular-nums text-slate-900">{totals.completionRate}%</p>
            <p className="text-xs text-slate-500">{t('dash.kpi.completion')}</p>
          </div>
        </div>
      )}

      {totals.inactive > 0 && totals.mostInactiveCourseId && (
        <div className="flex items-center gap-3 rounded-[20px] bg-amber-100 p-3.5">
          <div className="h-10 w-10 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
            <TrendingDown className="h-5 w-5 text-[#0B2463]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">{t('dash.inactive.title', { n: totals.inactive })}</p>
            <p className="text-xs text-amber-800">{t('dash.inactive.desc')}</p>
          </div>
          <button
            onClick={() => onOpenStudents(totals.mostInactiveCourseId!)}
            className="h-10 px-3 rounded-xl bg-surface text-sm font-semibold text-amber-900 flex-shrink-0 active:scale-95 transition-transform"
          >
            {t('dash.inactive.action')}
          </button>
        </div>
      )}

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
        showOnboarding ? null : <EmptyState
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
                  <CourseCover course={course} className="h-16 w-16 rounded-[14px] flex-shrink-0" initialsClassName="text-lg" />
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
                            ? 'bg-green-100 text-green-800'
                            : 'bg-amber-100 text-amber-900'
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
