import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, Check, BookOpen, FileText, Link as LinkIcon, Share2, Copy, Check as CheckIcon } from 'lucide-react';
import { Card } from '@/components/Card';
import { ProgressBar } from '@/components/ProgressBar';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { AppHeader } from '@/components/AppHeader';
import { useUser } from '@/hooks/useUser';
import {
  fetchCourseById,
  fetchModulesWithLessons,
  fetchLessonProgress,
  fetchEnrollment,
  createEnrollment,
  calculateProgress,
  updateLastLesson,
  fetchCreatorName,
} from '@/lib/courseService';
import type { Course, ModuleWithLessons, LessonProgress, LessonState } from '@/lib/types';
import { buildCourseDeepLink } from '@/lib/deepLink';

export function CoursePage({
  courseId,
  onBack,
  onOpenLesson,
}: {
  courseId: string;
  onBack: () => void;
  onOpenLesson: (courseId: string, lessonId: string) => void;
}) {
  const { user } = useUser();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<ModuleWithLessons[]>([]);
  const [progressList, setProgressList] = useState<LessonProgress[]>([]);
  const [creatorName, setCreatorName] = useState<string>('');
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      const c = await fetchCourseById(courseId);
      if (!c) {
        setError('Course not found');
        setLoading(false);
        return;
      }
      setCourse(c);

      const [mods, lp, existingEnrollment] = await Promise.all([
        fetchModulesWithLessons(courseId),
        fetchLessonProgress(user.id, courseId),
        fetchEnrollment(user.id, courseId),
      ]);

      if (!existingEnrollment) {
        await createEnrollment(user.id, courseId);
      }

      setModules(mods);
      setProgressList(lp);
      setCreatorName(await fetchCreatorName(c.creator_id));

      // Auto-expand first module
      if (mods.length > 0) {
        setExpandedModules(new Set([mods[0].id]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load course');
    } finally {
      setLoading(false);
    }
  }, [user, courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const handleLessonClick = async (lessonId: string) => {
    if (!user) return;
    await updateLastLesson(user.id, courseId, lessonId);
    onOpenLesson(courseId, lessonId);
  };

  const handleCopyLink = () => {
    if (!course) return;
    const link = buildCourseDeepLink(course.id);
    navigator.clipboard?.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (loading) return (
    <>
      <AppHeader title="Course" onBack={onBack} />
      <LoadingScreen message="Loading course..." />
    </>
  );

  if (error) return (
    <>
      <AppHeader title="Course" onBack={onBack} />
      <ErrorState message={error} onRetry={load} />
    </>
  );

  if (!course) return null;

  const completedSet = new Set(progressList.filter((p) => p.completed).map((p) => p.lesson_id));
  const progress = calculateProgress(modules, progressList);
  const totalModules = modules.length;

  const getLessonState = (lessonId: string): LessonState => {
    if (completedSet.has(lessonId)) return 'completed';
    return 'not_started';
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title={course.title}
        onBack={onBack}
        rightAction={
          <button
            onClick={handleCopyLink}
            className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 active:scale-90 transition-all"
            aria-label="Share course"
          >
            {linkCopied ? (
              <CheckIcon className="h-5 w-5 text-green-500" />
            ) : (
              <Share2 className="h-5 w-5 text-slate-600" />
            )}
          </button>
        }
      />

      <div className="px-4 py-5 space-y-5">
        {/* Course header */}
        <Card className="p-5">
          {course.cover_url && (
            <div className="h-40 -mx-5 -mt-5 mb-4 rounded-t-2xl bg-slate-100 overflow-hidden">
              <img src={course.cover_url} alt={course.title} className="w-full h-full object-cover" />
            </div>
          )}
          <h1 className="text-xl font-bold text-slate-900">{course.title}</h1>
          <p className="text-sm text-slate-600 mt-2">{course.description}</p>
          <div className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <div className="h-7 w-7 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
              {creatorName.charAt(0).toUpperCase()}
            </div>
            <span>by {creatorName}</span>
          </div>
          <div className="mt-4 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-slate-500">
              <BookOpen className="h-4 w-4" />
              <span>{totalModules} modules</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-500">
              <FileText className="h-4 w-4" />
              <span>{progress.total_lessons} lessons</span>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-700">Overall Progress</span>
              <span className="text-sm font-bold text-blue-500">{progress.progress_percent}%</span>
            </div>
            <ProgressBar percent={progress.progress_percent} />
          </div>
        </Card>

        {/* Modules */}
        <div className="space-y-3">
          {modules.map((module, index) => {
            const expanded = expandedModules.has(module.id);
            const moduleCompleted = module.lessons.filter((l) => completedSet.has(l.id)).length;
            const moduleTotal = module.lessons.length;

            return (
              <Card key={module.id} className="overflow-hidden">
                <button
                  onClick={() => toggleModule(module.id)}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-bold text-blue-500">{index + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{module.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {moduleCompleted}/{moduleTotal} lessons completed
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${
                      expanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {expanded && (
                  <div className="border-t border-slate-100">
                    {module.lessons.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-slate-400">No lessons yet</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {module.lessons.map((lesson, lIdx) => {
                          const state = getLessonState(lesson.id);
                          return (
                            <button
                              key={lesson.id}
                              onClick={() => handleLessonClick(lesson.id)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 active:bg-slate-100 transition-colors"
                            >
                              <div className="flex-shrink-0">
                                {state === 'completed' ? (
                                  <div className="h-7 w-7 rounded-full bg-green-500 flex items-center justify-center">
                                    <Check className="h-4 w-4 text-white" strokeWidth={3} />
                                  </div>
                                ) : state === 'in_progress' ? (
                                  <div className="h-7 w-7 rounded-full border-2 border-blue-500 bg-blue-50 flex items-center justify-center">
                                    <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                                  </div>
                                ) : (
                                  <div className="h-7 w-7 rounded-full border-2 border-slate-300 flex items-center justify-center">
                                    <span className="text-xs font-medium text-slate-400">{lIdx + 1}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className={`text-sm font-medium truncate ${
                                    state === 'completed' ? 'text-slate-400 line-through' : 'text-slate-800'
                                  }`}
                                >
                                  {lesson.title}
                                </p>
                                {lesson.description && (
                                  <p className="text-xs text-slate-400 truncate mt-0.5">
                                    {lesson.description}
                                  </p>
                                )}
                              </div>
                              <ChevronDown className="h-4 w-4 text-slate-300 -rotate-90" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* Deep link share info */}
        <Card className="p-4 bg-slate-50">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <LinkIcon className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">Share link: {buildCourseDeepLink(course.id)}</span>
          </div>
          <button
            onClick={handleCopyLink}
            className="mt-2 flex items-center gap-1.5 text-sm font-medium text-blue-500"
          >
            {linkCopied ? (
              <><CheckIcon className="h-4 w-4" /> Copied!</>
            ) : (
              <><Copy className="h-4 w-4" /> Copy link</>
            )}
          </button>
        </Card>
      </div>
    </div>
  );
}
