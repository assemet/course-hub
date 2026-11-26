import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users, Activity, Trophy, Bell, BellRing, Check, AlertCircle, Copy, TrendingDown } from 'lucide-react';
import { Card } from '@/components/Card';
import { AppHeader } from '@/components/AppHeader';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState, EmptyState } from '@/components/StateViews';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { fetchCourseById, fetchModulesWithLessons } from '@/lib/courseService';
import {
  fetchCourseStudents, fetchLessonStats, isInactive, remindedRecently, INACTIVE_AFTER_DAYS,
  type CourseStudent,
} from '@/lib/insightsService';
import { sendReminderNotification } from '@/lib/notificationService';
import { buildCourseDeepLink } from '@/lib/deepLink';
import { hapticFeedback } from '@/lib/telegram';
import type { Course, ModuleWithLessons } from '@/lib/types';

type Tab = 'students' | 'lessons';
type Filter = 'all' | 'inactive' | 'completed';
type RemindState = 'sending' | 'sent' | 'recent' | 'failed';

const WEEK = 7 * 24 * 3_600_000;

function Avatar({ student }: { student: CourseStudent }) {
  const [broken, setBroken] = useState(false);
  if (student.photo_url && !broken) {
    return (
      <img
        src={student.photo_url}
        alt=""
        onError={() => setBroken(true)}
        className="h-10 w-10 rounded-full object-cover flex-shrink-0 bg-slate-100"
      />
    );
  }
  return (
    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0 text-white font-semibold">
      {student.first_name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}

function StatTile({ icon: Icon, value, label, tint }: { icon: typeof Users; value: number; label: string; tint: string }) {
  return (
    <Card className="p-3 flex-1 min-w-0">
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center mb-2 ${tint}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xl font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{label}</p>
    </Card>
  );
}

export function CourseStudents({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const { t, formatRelative } = useI18n();
  const [course, setCourse] = useState<Course | null>(null);
  const [students, setStudents] = useState<CourseStudent[]>([]);
  const [modules, setModules] = useState<ModuleWithLessons[]>([]);
  const [lessonStats, setLessonStats] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('students');
  const [filter, setFilter] = useState<Filter>('all');
  const [remind, setRemind] = useState<Record<string, RemindState>>({});
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [c, s, m, stats] = await Promise.all([
        fetchCourseById(courseId),
        fetchCourseStudents(courseId),
        fetchModulesWithLessons(courseId),
        fetchLessonStats(courseId),
      ]);
      setCourse(c);
      setStudents(s);
      setModules(m);
      setLessonStats(stats);
    } catch (err) {
      setError(errorMessage(err, t('students.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [courseId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const totalLessons = useMemo(() => modules.reduce((n, m) => n + m.lessons.length, 0), [modules]);
  const finished = useCallback(
    (s: CourseStudent) => totalLessons > 0 && s.completed_lessons >= totalLessons,
    [totalLessons]
  );

  const groups = useMemo(() => {
    const now = Date.now();
    return {
      all: students,
      inactive: students.filter((s) => !finished(s) && isInactive(s, now)),
      completed: students.filter(finished),
      activeThisWeek: students.filter((s) => now - new Date(s.last_activity_at).getTime() < WEEK).length,
    };
  }, [students, finished]);

  const visible = groups[filter];

  const canRemind = (s: CourseStudent) => !finished(s) && !remindedRecently(s) && !remind[s.user_id];

  const remindOne = async (s: CourseStudent): Promise<boolean> => {
    setRemind((r) => ({ ...r, [s.user_id]: 'sending' }));
    const result = await sendReminderNotification(courseId, s.user_id);
    const state: RemindState = result.sent ? 'sent' : result.recent ? 'recent' : 'failed';
    setRemind((r) => ({ ...r, [s.user_id]: state }));
    if (result.sent) {
      // Reflect the cooldown locally so "remind all" skips this student.
      setStudents((list) =>
        list.map((x) => (x.user_id === s.user_id ? { ...x, last_reminded_at: new Date().toISOString() } : x))
      );
    }
    return result.sent;
  };

  const remindAll = async () => {
    const targets = groups.inactive.filter(canRemind);
    setBulkResult(null);
    if (targets.length === 0) {
      setBulkResult(t('students.remindAllNone'));
      return;
    }
    if (!confirm(t('students.confirmRemindAll', { n: targets.length }))) return;
    let sent = 0;
    setBulk({ done: 0, total: targets.length });
    // One at a time: gentle on Telegram's limits and shows real progress.
    for (const [i, s] of targets.entries()) {
      if (await remindOne(s)) sent++;
      setBulk({ done: i + 1, total: targets.length });
    }
    setBulk(null);
    setBulkResult(t('students.remindAllDone', { n: sent }));
    hapticFeedback(sent > 0 ? 'success' : 'warning');
  };

  const copyLink = async () => {
    const link = buildCourseDeepLink(courseId);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t('course.copyPrompt'), link);
    }
  };

  // Lessons in course order with completion counts, and the biggest drop-off.
  const lessonRows = useMemo(() => {
    const flat = modules.flatMap((m) => m.lessons.map((l) => ({ module: m, lesson: l, count: lessonStats.get(l.id) ?? 0 })));
    let dropId: string | null = null;
    let maxDrop = 0;
    flat.forEach((row, i) => {
      const drop = i > 0 ? flat[i - 1].count - row.count : 0;
      if (drop > maxDrop) {
        maxDrop = drop;
        dropId = row.lesson.id;
      }
    });
    return { flat, dropId };
  }, [modules, lessonStats]);

  const title = course?.title ?? t('students.title');

  if (loading) return (
    <>
      <AppHeader title={title} onBack={onBack} />
      <LoadingScreen message={t('students.loading')} />
    </>
  );

  if (error) return (
    <>
      <AppHeader title={title} onBack={onBack} />
      <ErrorState message={error} onRetry={load} />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader title={title} onBack={onBack} />

      {/* Tabs */}
      <div className="sticky top-[57px] z-10 bg-surface/90 backdrop-blur border-b border-slate-200 flex">
        {(['students', 'lessons'] as Tab[]).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              tab === key ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-500'
            }`}
          >
            {t(key === 'students' ? 'students.tab.students' : 'students.tab.lessons')}
          </button>
        ))}
      </div>

      <div className="px-4 py-5 space-y-4 pb-24">
        {students.length === 0 ? (
          <Card className="p-4">
            <EmptyState
              title={t('students.empty.title')}
              description={t('students.empty.desc')}
              icon={<Users className="h-7 w-7 text-slate-400" />}
            />
            <button
              onClick={copyLink}
              className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold active:scale-[0.98] transition-all"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t('course.copied') : t('course.copyLink')}
            </button>
          </Card>
        ) : tab === 'students' ? (
          <>
            {/* Summary */}
            <div className="flex gap-3">
              <StatTile icon={Users} value={students.length} label={t('students.stat.total')} tint="bg-blue-50 text-blue-500" />
              <StatTile icon={Activity} value={groups.activeThisWeek} label={t('students.stat.active')} tint="bg-green-50 text-green-500" />
              <StatTile icon={Trophy} value={groups.completed.length} label={t('students.stat.completed')} tint="bg-amber-50 text-amber-500" />
            </div>

            {/* Filters */}
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4" role="tablist">
              {(['all', 'inactive', 'completed'] as Filter[]).map((key) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={filter === key}
                  onClick={() => { setFilter(key); setBulkResult(null); }}
                  className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    filter === key
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'bg-surface border-slate-200 text-slate-600'
                  }`}
                >
                  {t(`students.filter.${key}`)} <span className="tabular-nums opacity-80">({groups[key].length})</span>
                </button>
              ))}
            </div>

            {/* Bulk reminder for inactive students */}
            {filter === 'inactive' && groups.inactive.length > 0 && (
              <Card className="p-4">
                <p className="text-xs text-slate-500 mb-3">{t('students.inactiveHint', { days: INACTIVE_AFTER_DAYS })}</p>
                <button
                  onClick={remindAll}
                  disabled={bulk !== null}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white text-sm font-semibold active:scale-[0.98] disabled:opacity-70 transition-all"
                >
                  <BellRing className="h-4 w-4" />
                  {bulk
                    ? t('students.remindingProgress', { done: bulk.done, total: bulk.total })
                    : t('students.remindAll', { n: groups.inactive.filter(canRemind).length })}
                </button>
                {bulkResult && <p className="text-xs text-slate-600 mt-2 text-center">{bulkResult}</p>}
              </Card>
            )}

            {/* Student list */}
            {visible.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">{t('students.emptyFilter')}</p>
            ) : (
              <Card className="divide-y divide-slate-100">
                {visible.map((s) => {
                  const pct = totalLessons > 0 ? Math.min(100, Math.round((s.completed_lessons / totalLessons) * 100)) : 0;
                  const done = finished(s);
                  const state = remind[s.user_id] ?? (remindedRecently(s) ? 'recent' : undefined);
                  return (
                    <div key={s.user_id} className="p-4 flex items-start gap-3">
                      <Avatar student={s} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-1.5 min-w-0">
                          <p dir="auto" className="text-sm font-semibold text-slate-900 truncate">{s.first_name}</p>
                          {s.username && <p dir="ltr" className="text-xs text-slate-400 truncate">@{s.username}</p>}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${done ? 'bg-green-500' : 'bg-blue-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-500 tabular-nums flex-shrink-0">
                            <bdi>{s.completed_lessons}/{totalLessons}</bdi>
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 truncate">
                          {done ? t('students.finished') : t('students.lastActive', { when: formatRelative(s.last_activity_at) })}
                          {!done && s.current_lesson_title && (
                            <> · <span dir="auto">{t('students.currentLesson', { title: s.current_lesson_title })}</span></>
                          )}
                        </p>
                        {state === 'failed' && (
                          <p className="flex items-center gap-1 text-[11px] text-red-600 mt-1">
                            <AlertCircle className="h-3 w-3" /> {t('students.remindFailed')}
                          </p>
                        )}
                      </div>
                      {!done && (
                        <button
                          onClick={() => remindOne(s)}
                          disabled={!!state && state !== 'failed'}
                          className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            state === 'sent' || state === 'recent'
                              ? 'bg-green-50 text-green-600'
                              : 'bg-blue-50 text-blue-600 active:scale-95 disabled:opacity-60'
                          }`}
                        >
                          {state === 'sending' ? (
                            <div className="h-3.5 w-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                          ) : state === 'sent' || state === 'recent' ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Bell className="h-3.5 w-3.5" />
                          )}
                          {state === 'sent'
                            ? t('students.reminded')
                            : state === 'recent'
                              ? t('students.remindedRecently')
                              : t('students.remind')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </Card>
            )}
          </>
        ) : (
          /* Lessons tab: completion per lesson */
          <>
            <p className="text-xs text-slate-500">{t('students.lessonsHint')}</p>
            {modules.map((m) => (
              <div key={m.id}>
                <h2 dir="auto" className="text-sm font-semibold text-slate-500 mb-2 px-1 text-start">{m.title}</h2>
                <Card className="divide-y divide-slate-100">
                  {m.lessons.map((l) => {
                    const count = lessonStats.get(l.id) ?? 0;
                    const pct = students.length > 0 ? Math.round((count / students.length) * 100) : 0;
                    const isDrop = l.id === lessonRows.dropId;
                    return (
                      <div key={l.id} className={`p-4 ${isDrop ? 'bg-amber-50/60' : ''}`}>
                        <div className="flex items-center justify-between gap-3">
                          <p dir="auto" className="text-sm font-medium text-slate-800 truncate text-left rtl:text-right">{l.title}</p>
                          <span className="text-xs text-slate-500 flex-shrink-0 tabular-nums">
                            {t('students.ofStudents', { done: count, total: students.length })}
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isDrop ? 'bg-amber-500' : 'bg-blue-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        {isDrop && (
                          <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700">
                            <TrendingDown className="h-3.5 w-3.5" /> {t('students.dropBadge')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </Card>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
