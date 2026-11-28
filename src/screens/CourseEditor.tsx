import { useEffect, useState, useCallback } from 'react';
import {
  Plus, ChevronDown, ChevronUp, Trash2, Edit2,
  Save, X, Globe, GlobeLock, FileText, Link as LinkIcon, Download, Send,
  BookOpen, ShieldCheck, ShieldOff, ClipboardList, Lock, LockOpen, Layers,
} from 'lucide-react';
import { Card } from '@/components/Card';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState, EmptyState } from '@/components/StateViews';
import { AppHeader } from '@/components/AppHeader';
import { useUser } from '@/hooks/useUser';
import { supabase } from '@/lib/supabase';
import {
  fetchCourseById,
  fetchModulesWithLessons,
  fetchResourcesByLesson,
} from '@/lib/courseService';
import { hapticFeedback, sanitizeUrl } from '@/lib/telegram';
import { useI18n, type TKey } from '@/lib/i18n';
import { useBackButton } from '@/hooks/useBackButton';
import { QuizEditor } from '@/components/QuizEditor';
import { FlashcardEditor } from '@/components/FlashcardEditor';
import { fetchFlashcardStats, type ModuleFlashcardStats } from '@/lib/flashcardService';
import { fetchCourseQuizStatus, type QuizStatus } from '@/lib/quizService';
import { errorMessage } from '@/lib/errors';
import { needsThumbnail } from '@/lib/mediaService';
import { ThumbnailRefreshCard } from '@/components/ThumbnailRefreshCard';
import { LessonThumb } from '@/components/LessonThumb';
import { AnnouncementsCard } from '@/components/AnnouncementsCard';
import type { Course, ModuleWithLessons, Lesson, Resource, ResourceType } from '@/lib/types';

type EditView = 'overview' | 'modules' | 'lesson';

export function CourseEditor({
  courseId,
  isNew,
  onBack,
}: {
  courseId: string | null;
  isNew: boolean;
  onBack: () => void;
}) {
  const { user } = useUser();
  const { t } = useI18n();
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<ModuleWithLessons[]>([]);
  const [view, setView] = useState<EditView>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // fatal: course couldn't be loaded
  const [actionError, setActionError] = useState<string | null>(null); // recoverable: a save/delete failed

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [slug, setSlug] = useState('');
  const [saving, setSaving] = useState(false);

  // Editing states
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [moduleTitleInput, setModuleTitleInput] = useState('');
  const [editingLesson, setEditingLesson] = useState<{ moduleId: string; lesson: Lesson | null } | null>(null);
  const [editingQuiz, setEditingQuiz] = useState<{ moduleId: string; title: string } | null>(null);
  const [quizStatus, setQuizStatus] = useState<Map<string, QuizStatus>>(new Map());
  const [editingCards, setEditingCards] = useState<{ moduleId: string; title: string } | null>(null);
  const [cardStats, setCardStats] = useState<Map<string, ModuleFlashcardStats>>(new Map());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);

      if (isNew) {
        setView('overview');
        setLoading(false);
        return;
      }

      if (!courseId) return;
      const c = await fetchCourseById(courseId);
      if (!c) {
        setError(t('common.courseNotFound'));
        setLoading(false);
        return;
      }
      if (c.creator_id !== user.id) {
        setError(t('editor.notOwner'));
        setLoading(false);
        return;
      }
      setCourse(c);
      setTitle(c.title);
      setDescription(c.description ?? '');
      setCoverUrl(c.cover_url ?? '');
      setSlug(c.slug ?? '');

      const [mods, quizzes, cards] = await Promise.all([
        fetchModulesWithLessons(courseId),
        // Optional: the editor still works if quizzes/cards can't be loaded.
        fetchCourseQuizStatus(courseId).catch(() => new Map<string, QuizStatus>()),
        fetchFlashcardStats(courseId).catch(() => new Map<string, ModuleFlashcardStats>()),
      ]);
      setModules(mods);
      setQuizStatus(quizzes);
      setCardStats(cards);
      if (mods.length > 0) {
        setExpandedModules(new Set([mods[0].id]));
      }
    } catch (err) {
      setError(errorMessage(err, t('course.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [user, courseId, isNew, t]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  // === Course save ===
  const handleSaveCourse = async () => {
    if (!user || !title.trim()) return;
    const cleanSlug = slug.trim().toLowerCase();
    if (cleanSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
      setActionError(t('editor.slugInvalid'));
      return;
    }
    if (coverUrl.trim() && !sanitizeUrl(coverUrl)) {
      setActionError(t('editor.coverInvalid'));
      return;
    }
    try {
      setSaving(true);
      setActionError(null);
      if (course) {
        const { error: updErr } = await supabase
          .from('courses')
          .update({
            title: title.trim(),
            description: description.trim() || null,
            cover_url: coverUrl.trim() || null,
            slug: cleanSlug || null,
          })
          .eq('id', course.id);
        if (updErr) throw updErr;
        setCourse({ ...course, title: title.trim(), description: description.trim() || null, cover_url: coverUrl.trim() || null, slug: cleanSlug || null });
      } else {
        const { data, error: insErr } = await supabase
          .from('courses')
          .insert({
            creator_id: user.id,
            title: title.trim(),
            description: description.trim() || null,
            cover_url: coverUrl.trim() || null,
            slug: cleanSlug || null,
            status: 'draft',
          })
          .select()
          .single();
        if (insErr) throw insErr;
        setCourse(data as Course);
        setView('modules');
      }
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      setActionError(
        code === '23505'
          ? t('editor.slugTaken')
          : errorMessage(err, t('editor.saveFailed'))
      );
    } finally {
      setSaving(false);
    }
  };

  // === Publish / Unpublish ===
  const handleTogglePublish = async () => {
    if (!course) return;
    try {
      const newStatus = course.status === 'published' ? 'draft' : 'published';
      const { error: err } = await supabase
        .from('courses')
        .update({ status: newStatus })
        .eq('id', course.id);
      if (err) throw err;
      setCourse({ ...course, status: newStatus });
      hapticFeedback('success');
    } catch (err) {
      setActionError(errorMessage(err, t('editor.statusFailed')));
    }
  };

  // === Quiz gating ===
  const handleToggleGating = async () => {
    if (!course) return;
    try {
      const next = !course.quiz_gating;
      const { error: err } = await supabase.from('courses').update({ quiz_gating: next }).eq('id', course.id);
      if (err) throw err;
      setCourse({ ...course, quiz_gating: next });
      hapticFeedback('success');
    } catch (err) {
      setActionError(errorMessage(err, t('editor.gatingFailed')));
    }
  };

  const refreshCardStats = async () => {
    if (!course) return;
    try {
      setCardStats(await fetchFlashcardStats(course.id));
    } catch {
      // keep the previous counts
    }
  };

  const refreshQuizStatus = async () => {
    if (!course) return;
    try {
      setQuizStatus(await fetchCourseQuizStatus(course.id));
    } catch {
      // keep the previous counts
    }
  };

  // === Content protection ===
  const handleToggleProtect = async () => {
    if (!course) return;
    try {
      const next = !course.protect_content;
      const { error: err } = await supabase
        .from('courses')
        .update({ protect_content: next })
        .eq('id', course.id);
      if (err) throw err;
      setCourse({ ...course, protect_content: next });
      hapticFeedback('success');
    } catch (err) {
      setActionError(errorMessage(err, t('editor.protectFailed')));
    }
  };

  // === Module CRUD ===
  const handleAddModule = async () => {
    if (!course || !moduleTitleInput.trim()) return;
    try {
      const { data, error: err } = await supabase
        .from('modules')
        .insert({
          course_id: course.id,
          title: moduleTitleInput.trim(),
          position: modules.length,
        })
        .select()
        .single();
      if (err) throw err;
      setModules([...modules, { ...(data as ModuleWithLessons), lessons: [] }]);
      setModuleTitleInput('');
      hapticFeedback('light');
    } catch (err) {
      setActionError(errorMessage(err, t('editor.addModuleFailed')));
    }
  };

  const handleRenameModule = async (moduleId: string) => {
    if (!moduleTitleInput.trim()) return;
    try {
      const { error: err } = await supabase
        .from('modules')
        .update({ title: moduleTitleInput.trim() })
        .eq('id', moduleId);
      if (err) throw err;
      setModules(modules.map((m) => m.id === moduleId ? { ...m, title: moduleTitleInput.trim() } : m));
      setEditingModuleId(null);
      setModuleTitleInput('');
    } catch (err) {
      setActionError(errorMessage(err, t('editor.renameModuleFailed')));
    }
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm(t('editor.confirmDeleteModule'))) return;
    try {
      const { error: err } = await supabase.from('modules').delete().eq('id', moduleId);
      if (err) throw err;
      setModules(modules.filter((m) => m.id !== moduleId));
      hapticFeedback('warning');
    } catch (err) {
      setActionError(errorMessage(err, t('editor.deleteModuleFailed')));
    }
  };

  const handleReorderModule = async (moduleId: string, direction: 'up' | 'down') => {
    const idx = modules.findIndex((m) => m.id === moduleId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= modules.length) return;

    const newModules = [...modules];
    [newModules[idx], newModules[swapIdx]] = [newModules[swapIdx], newModules[idx]];

    try {
      const results = await Promise.all(
        newModules.map((m, i) => supabase.from('modules').update({ position: i }).eq('id', m.id))
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      setModules(newModules);
    } catch (err) {
      setActionError(errorMessage(err, t('editor.reorderModulesFailed')));
    }
  };

  // === Lesson CRUD ===
  const handleSaveLesson = async (lessonData: {
    title: string;
    description: string;
    content: string;
    telegram_url: string;
    moduleId: string;
    lessonId: string | null;
  }) => {
    if (!course || !lessonData.title.trim()) return;
    if (lessonData.telegram_url.trim() && !sanitizeUrl(lessonData.telegram_url)) {
      setActionError(t('editor.lessonUrlInvalid'));
      return;
    }
    try {
      setActionError(null);
      const mod = modules.find((m) => m.id === lessonData.moduleId);
      if (!mod) return;

      if (lessonData.lessonId) {
        const { error: err } = await supabase
          .from('lessons')
          .update({
            title: lessonData.title.trim(),
            description: lessonData.description.trim() || null,
            content: lessonData.content.trim() || null,
            telegram_url: lessonData.telegram_url.trim() || null,
          })
          .eq('id', lessonData.lessonId);
        if (err) throw err;

        setModules(modules.map((m) =>
          m.id === lessonData.moduleId
            ? {
                ...m,
                lessons: m.lessons.map((l) =>
                  l.id === lessonData.lessonId
                    ? { ...l, title: lessonData.title.trim(), description: lessonData.description.trim() || null, content: lessonData.content.trim() || null, telegram_url: lessonData.telegram_url.trim() || null }
                    : l
                ),
              }
            : m
        ));
      } else {
        const { data, error: err } = await supabase
          .from('lessons')
          .insert({
            module_id: lessonData.moduleId,
            title: lessonData.title.trim(),
            description: lessonData.description.trim() || null,
            content: lessonData.content.trim() || null,
            telegram_url: lessonData.telegram_url.trim() || null,
            position: mod.lessons.length,
          })
          .select()
          .single();
        if (err) throw err;

        setModules(modules.map((m) =>
          m.id === lessonData.moduleId
            ? { ...m, lessons: [...m.lessons, data as Lesson] }
            : m
        ));
      }
      setEditingLesson(null);
      hapticFeedback('light');
    } catch (err) {
      setActionError(errorMessage(err, t('editor.saveLessonFailed')));
    }
  };

  const handleDeleteLesson = async (moduleId: string, lessonId: string) => {
    if (!confirm(t('editor.confirmDeleteLesson'))) return;
    try {
      const { error: err } = await supabase.from('lessons').delete().eq('id', lessonId);
      if (err) throw err;
      setModules(modules.map((m) =>
        m.id === moduleId ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) } : m
      ));
      hapticFeedback('warning');
    } catch (err) {
      setActionError(errorMessage(err, t('editor.deleteLessonFailed')));
    }
  };

  const handleReorderLesson = async (moduleId: string, lessonId: string, direction: 'up' | 'down') => {
    const mod = modules.find((m) => m.id === moduleId);
    if (!mod) return;
    const idx = mod.lessons.findIndex((l) => l.id === lessonId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= mod.lessons.length) return;

    const newLessons = [...mod.lessons];
    [newLessons[idx], newLessons[swapIdx]] = [newLessons[swapIdx], newLessons[idx]];

    try {
      const results = await Promise.all(
        newLessons.map((l, i) => supabase.from('lessons').update({ position: i }).eq('id', l.id))
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
      setModules(modules.map((m) =>
        m.id === moduleId ? { ...m, lessons: newLessons } : m
      ));
    } catch (err) {
      setActionError(errorMessage(err, t('editor.reorderLessonsFailed')));
    }
  };

  // === Resource CRUD ===
  const handleAddResource = async (lessonId: string, resource: { title: string; type: ResourceType; url: string; description: string }) => {
    if (!resource.title.trim() || !resource.url.trim()) return;
    if (!sanitizeUrl(resource.url)) {
      setActionError(t('editor.resourceUrlInvalid'));
      return;
    }
    try {
      const { data, error: err } = await supabase
        .from('resources')
        .insert({
          lesson_id: lessonId,
          title: resource.title.trim(),
          type: resource.type,
          url: resource.url.trim(),
          description: resource.description.trim() || null,
        })
        .select()
        .single();
      if (err) throw err;
      setModules(modules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) =>
          l.id === lessonId ? { ...l } : l
        ),
      })));
      // Resources are loaded separately in LessonEditor, so we just need to refresh
      hapticFeedback('light');
      return data;
    } catch (err) {
      setActionError(errorMessage(err, t('editor.addResourceFailed')));
    }
  };

  const handleDeleteResource = async (resourceId: string) => {
    try {
      const { error: err } = await supabase.from('resources').delete().eq('id', resourceId);
      if (err) throw err;
      hapticFeedback('warning');
    } catch (err) {
      setActionError(errorMessage(err, t('editor.deleteResourceFailed')));
    }
  };

  if (loading) return (
    <>
      <AppHeader title={isNew ? t('editor.create') : t('editor.edit')} onBack={onBack} />
      <LoadingScreen />
    </>
  );

  if (error) return (
    <>
      <AppHeader title={isNew ? t('editor.create') : t('editor.edit')} onBack={onBack} />
      <ErrorState message={error} onRetry={load} />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title={isNew ? t('editor.create') : course?.title ?? t('editor.edit')}
        onBack={onBack}
        rightAction={
          course ? (
            <button
              onClick={handleTogglePublish}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 ${
                course.status === 'published'
                  ? 'bg-amber-50 text-amber-600'
                  : 'bg-green-50 text-green-600'
              }`}
            >
              {course.status === 'published' ? (
                <><GlobeLock className="h-3.5 w-3.5" /> {t('editor.unpublish')}</>
              ) : (
                <><Globe className="h-3.5 w-3.5" /> {t('editor.publish')}</>
              )}
            </button>
          ) : null
        }
      />

      {/* View tabs */}
      {course && (
        <div className="flex border-b border-slate-200 bg-surface px-4 gap-1">
          <TabButton active={view === 'overview'} onClick={() => setView('overview')} label={t('editor.tab.overview')} />
          <TabButton active={view === 'modules'} onClick={() => setView('modules')} label={t('editor.tab.modules')} />
        </div>
      )}

      <div className="px-4 py-5 space-y-5 pb-24">
        {actionError && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <span>{actionError}</span>
            <button onClick={() => setActionError(null)} aria-label={t('common.dismiss')} className="flex-shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {view === 'overview' && (
          <div className="space-y-4">
            {course && <AnnouncementsCard courseId={course.id} published={course.status === 'published'} />}

            <Card className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">{t('editor.courseTitle')}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('editor.courseTitlePh')}
                  dir="auto"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">{t('editor.description')}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('editor.descriptionPh')}
                  dir="auto"
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">{t('editor.cover')}</label>
                <input
                  type="text"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="https://..."
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">{t('editor.slug')}</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="python-for-beginners"
                  dir="ltr"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleSaveCourse}
                disabled={saving || !title.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 active:scale-[0.98] disabled:opacity-50 transition-all"
              >
                <Save className="h-4 w-4" />
                {course ? t('editor.saveChanges') : t('editor.create')}
              </button>
            </Card>

            {course && (
              <Card className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    course.status === 'published' ? 'bg-green-50' : 'bg-amber-50'
                  }`}>
                    {course.status === 'published' ? (
                      <Globe className="h-5 w-5 text-green-500" />
                    ) : (
                      <GlobeLock className="h-5 w-5 text-amber-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {t('editor.statusLabel', { status: course.status === 'published' ? t('status.published') : t('status.draft') })}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {course.status === 'published'
                        ? t('editor.publishedHint')
                        : t('editor.draftHint')}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {course && (
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    course.protect_content ? 'bg-blue-50' : 'bg-slate-100'
                  }`}>
                    {course.protect_content ? (
                      <ShieldCheck className="h-5 w-5 text-blue-500" />
                    ) : (
                      <ShieldOff className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p id="protect-label" className="text-sm font-semibold text-slate-900">{t('editor.protect.title')}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {course.protect_content ? t('editor.protect.on') : t('editor.protect.off')}
                    </p>
                    {course.protect_content && (
                      <p className="text-[11px] text-slate-400 mt-1.5">{t('editor.protect.note')}</p>
                    )}
                  </div>
                  <button
                    role="switch"
                    aria-checked={course.protect_content}
                    aria-labelledby="protect-label"
                    onClick={handleToggleProtect}
                    className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
                      course.protect_content ? 'bg-blue-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        course.protect_content ? 'start-6' : 'start-1'
                      }`}
                    />
                  </button>
                </div>
              </Card>
            )}

            {course && (
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    course.quiz_gating ? 'bg-purple-50' : 'bg-slate-100'
                  }`}>
                    {course.quiz_gating ? (
                      <Lock className="h-5 w-5 text-purple-500" />
                    ) : (
                      <LockOpen className="h-5 w-5 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p id="gating-label" className="text-sm font-semibold text-slate-900">{t('editor.gating.title')}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {course.quiz_gating ? t('editor.gating.on') : t('editor.gating.off')}
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={course.quiz_gating}
                    aria-labelledby="gating-label"
                    onClick={handleToggleGating}
                    className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
                      course.quiz_gating ? 'bg-purple-500' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        course.quiz_gating ? 'start-6' : 'start-1'
                      }`}
                    />
                  </button>
                </div>
              </Card>
            )}
          </div>
        )}

        {view === 'modules' && course && (
          <div className="space-y-4">
            {/* Lessons imported before previews were kept */}
            <ThumbnailRefreshCard
              courseId={course.id}
              missing={modules.reduce((n, m) => n + m.lessons.filter(needsThumbnail).length, 0)}
              onDone={async () => {
                try {
                  setModules(await fetchModulesWithLessons(course.id));
                } catch {
                  // The old list stays; previews show after the next reload.
                }
              }}
            />

            {/* Add module */}
            <Card className="p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editingModuleId === null ? moduleTitleInput : ''}
                  onChange={(e) => setModuleTitleInput(e.target.value)}
                  placeholder={t('editor.newModulePh')}
                  dir="auto"
                  className="flex-1 min-w-0 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddModule()}
                />
                <button
                  onClick={handleAddModule}
                  disabled={!moduleTitleInput.trim()}
                  className="flex flex-shrink-0 items-center gap-1 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 active:scale-95 disabled:opacity-50 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  {t('common.add')}
                </button>
              </div>
            </Card>

            {/* Modules list */}
            {modules.length === 0 ? (
              <EmptyState
                title={t('editor.noModules.title')}
                description={t('editor.noModules.desc')}
                icon={<BookOpen className="h-7 w-7 text-slate-400" />}
              />
            ) : (
              <div className="space-y-3">
                {modules.map((module, mIdx) => {
                  const expanded = expandedModules.has(module.id);
                  return (
                    <Card key={module.id} className="overflow-hidden">
                      <div className="flex items-center gap-2 p-3">
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => handleReorderModule(module.id, 'up')}
                            disabled={mIdx === 0}
                            aria-label={t('editor.moveUp')}
                            className="text-slate-300 enabled:hover:text-slate-600 disabled:opacity-30 transition-colors"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleReorderModule(module.id, 'down')}
                            disabled={mIdx === modules.length - 1}
                            aria-label={t('editor.moveDown')}
                            className="text-slate-300 enabled:hover:text-slate-600 disabled:opacity-30 transition-colors"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          onClick={() => toggleModule(module.id)}
                          className="flex-1 flex items-center gap-2 text-start min-w-0"
                        >
                          <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-blue-500">{mIdx + 1}</span>
                          </div>
                          {editingModuleId === module.id ? (
                            <input
                              type="text"
                              value={moduleTitleInput}
                              onChange={(e) => setModuleTitleInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameModule(module.id);
                                if (e.key === 'Escape') { setEditingModuleId(null); setModuleTitleInput(''); }
                              }}
                              onBlur={() => handleRenameModule(module.id)}
                              autoFocus
                              dir="auto"
                              className="flex-1 px-2 py-1 rounded-lg border border-blue-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            <div className="flex-1 min-w-0">
                              <p dir="auto" className="text-sm font-semibold text-slate-900 truncate text-left rtl:text-right">{module.title}</p>
                              <p className="text-xs text-slate-400 text-start">{t('common.lessonsCount', { n: module.lessons.length })}</p>
                            </div>
                          )}
                          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        <button
                          onClick={() => { setEditingModuleId(module.id); setModuleTitleInput(module.title); }}
                          aria-label={t('editor.rename')}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteModule(module.id)}
                          aria-label={t('common.delete')}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {expanded && (
                        <div className="border-t border-slate-100 px-3 py-2 space-y-1.5">
                          {module.lessons.map((lesson, lIdx) => (
                            <div key={lesson.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 transition-colors">
                              <div className="flex flex-col gap-0.5 flex-shrink-0">
                                <button
                                  onClick={() => handleReorderLesson(module.id, lesson.id, 'up')}
                                  disabled={lIdx === 0}
                                  aria-label={t('editor.moveUp')}
                                  className="text-slate-300 enabled:hover:text-slate-600 disabled:opacity-30 transition-colors"
                                >
                                  <ChevronUp className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleReorderLesson(module.id, lesson.id, 'down')}
                                  disabled={lIdx === module.lessons.length - 1}
                                  aria-label={t('editor.moveDown')}
                                  className="text-slate-300 enabled:hover:text-slate-600 disabled:opacity-30 transition-colors"
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </button>
                              </div>
                              <button
                                onClick={() => setEditingLesson({ moduleId: module.id, lesson })}
                                className="flex-1 flex items-center gap-2 text-start min-w-0"
                              >
                                <LessonThumb lesson={lesson} courseId={course.id} className="h-9 w-12 rounded-md" iconClassName="h-4 w-4" withDuration />
                                <span dir="auto" className="text-sm text-slate-700 truncate text-left rtl:text-right">{lesson.title}</span>
                              </button>
                              <button
                                onClick={() => setEditingLesson({ moduleId: module.id, lesson })}
                                aria-label={t('editor.editLesson')}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteLesson(module.id, lesson.id)}
                                aria-label={t('common.delete')}
                                className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}

                          <button
                            onClick={() => setEditingLesson({ moduleId: module.id, lesson: null })}
                            className="w-full flex items-center gap-2 py-2 px-2 rounded-lg text-blue-500 text-sm font-medium hover:bg-blue-50 transition-colors"
                          >
                            <Plus className="h-4 w-4" />
                            {t('editor.addLesson')}
                          </button>
                          <button
                            onClick={() => setEditingQuiz({ moduleId: module.id, title: module.title })}
                            className="w-full flex items-center gap-2 py-2 px-2 rounded-lg text-purple-600 text-sm font-medium hover:bg-purple-50 transition-colors"
                          >
                            <ClipboardList className="h-4 w-4" />
                            <span className="flex-1 text-start">{t('editor.moduleQuiz')}</span>
                            <span className="text-xs font-normal text-slate-400">
                              {(quizStatus.get(module.id)?.question_count ?? 0) > 0
                                ? t('editor.quizQuestions', { n: quizStatus.get(module.id)!.question_count })
                                : t('editor.noQuiz')}
                            </span>
                          </button>
                          <button
                            onClick={() => setEditingCards({ moduleId: module.id, title: module.title })}
                            className="w-full flex items-center gap-2 py-2 px-2 rounded-lg text-purple-600 text-sm font-medium hover:bg-purple-50 transition-colors"
                          >
                            <Layers className="h-4 w-4" />
                            <span className="flex-1 text-start">{t('editor.flashcards')}</span>
                            <span className="text-xs font-normal text-slate-400">
                              {(cardStats.get(module.id)?.total ?? 0) > 0
                                ? t('cardEditor.count', { n: cardStats.get(module.id)!.total })
                                : t('editor.noQuiz')}
                            </span>
                          </button>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {editingCards && (
        <FlashcardEditor
          moduleId={editingCards.moduleId}
          moduleTitle={editingCards.title}
          onClose={() => {
            setEditingCards(null);
            refreshCardStats();
          }}
        />
      )}

      {editingQuiz && (
        <QuizEditor
          moduleId={editingQuiz.moduleId}
          moduleTitle={editingQuiz.title}
          onClose={() => {
            setEditingQuiz(null);
            refreshQuizStatus();
          }}
        />
      )}

      {/* Lesson Editor Modal */}
      {editingLesson && course && (
        <LessonEditorModal
          moduleId={editingLesson.moduleId}
          lesson={editingLesson.lesson}
          onClose={() => setEditingLesson(null)}
          onSave={handleSaveLesson}
          onAddResource={handleAddResource}
          onDeleteResource={handleDeleteResource}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-blue-500 text-blue-500' : 'border-transparent text-slate-400 hover:text-slate-600'
      }`}
    >
      {label}
    </button>
  );
}

// === Lesson Editor Modal ===
function LessonEditorModal({
  moduleId,
  lesson,
  onClose,
  onSave,
  onAddResource,
  onDeleteResource,
}: {
  moduleId: string;
  lesson: Lesson | null;
  onClose: () => void;
  onSave: (data: { title: string; description: string; content: string; telegram_url: string; moduleId: string; lessonId: string | null }) => void;
  onAddResource: (lessonId: string, resource: { title: string; type: ResourceType; url: string; description: string }) => Promise<unknown>;
  onDeleteResource: (resourceId: string) => Promise<void>;
}) {
  // Back closes this modal first, before leaving the editor.
  useBackButton(onClose);
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [description, setDescription] = useState(lesson?.description ?? '');
  const [content, setContent] = useState(lesson?.content ?? '');
  const [telegramUrl, setTelegramUrl] = useState(lesson?.telegram_url ?? '');
  const [resources, setResources] = useState<Resource[]>([]);
  const [showResourceForm, setShowResourceForm] = useState(false);
  const [resTitle, setResTitle] = useState('');
  const [resType, setResType] = useState<ResourceType>('link');
  const [resUrl, setResUrl] = useState('');
  const [resDesc, setResDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    if (lesson) {
      fetchResourcesByLesson(lesson.id).then(setResources).catch(() => {});
    }
  }, [lesson]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({
      title,
      description,
      content,
      telegram_url: telegramUrl,
      moduleId,
      lessonId: lesson?.id ?? null,
    });
    setSaving(false);
  };

  const handleAddRes = async () => {
    if (!lesson || !resTitle.trim() || !resUrl.trim()) return;
    const data = await onAddResource(lesson.id, { title: resTitle, type: resType, url: resUrl, description: resDesc });
    if (data) {
      setResources([...resources, data as Resource]);
      setResTitle('');
      setResType('link');
      setResUrl('');
      setResDesc('');
      setShowResourceForm(false);
    }
  };

  const handleDeleteRes = async (resourceId: string) => {
    await onDeleteResource(resourceId);
    setResources(resources.filter((r) => r.id !== resourceId));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-surface w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-slate-100 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-slate-900">
            {lesson ? t('editor.lesson.edit') : t('editor.lesson.new')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-2 rounded-xl hover:bg-slate-100 active:scale-90 transition-all"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">{t('editor.lesson.title')}</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('editor.lesson.titlePh')}
              dir="auto"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">{t('editor.lesson.description')}</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('editor.lesson.descriptionPh')}
              dir="auto"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">{t('editor.lesson.content')}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('editor.lesson.contentPh')}
              dir="auto"
              rows={6}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">{t('editor.lesson.telegramUrl')}</label>
            <input
              type="text"
              value={telegramUrl}
              onChange={(e) => setTelegramUrl(e.target.value)}
              placeholder="https://t.me/..."
              dir="ltr"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Resources section — only for existing lessons */}
          {lesson && (
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-700">{t('lesson.resources')}</label>
                <button
                  onClick={() => setShowResourceForm(!showResourceForm)}
                  className="flex items-center gap-1 text-blue-500 text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  {t('common.add')}
                </button>
              </div>

              {showResourceForm && (
                <div className="space-y-2 p-3 rounded-xl bg-slate-50 mb-3">
                  <input
                    type="text"
                    value={resTitle}
                    onChange={(e) => setResTitle(e.target.value)}
                    placeholder={t('editor.res.titlePh')}
                    dir="auto"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={resType}
                    onChange={(e) => setResType(e.target.value as ResourceType)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="link">{t('editor.res.type.link')}</option>
                    <option value="pdf">{t('editor.res.type.pdf')}</option>
                    <option value="file">{t('editor.res.type.file')}</option>
                    <option value="telegram">{t('editor.res.type.telegram')}</option>
                  </select>
                  <input
                    type="text"
                    value={resUrl}
                    onChange={(e) => setResUrl(e.target.value)}
                    placeholder={t('editor.res.urlPh')}
                    dir="ltr"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={resDesc}
                    onChange={(e) => setResDesc(e.target.value)}
                    placeholder={t('editor.lesson.description')}
                    dir="auto"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddRes}
                      disabled={!resTitle.trim() || !resUrl.trim()}
                      className="flex-1 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-all"
                    >
                      {t('editor.res.save')}
                    </button>
                    <button
                      onClick={() => setShowResourceForm(false)}
                      className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              )}

              {resources.length > 0 ? (
                <div className="space-y-2">
                  {resources.map((res) => (
                    <div key={res.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50">
                      <div className="h-8 w-8 rounded-lg bg-surface flex items-center justify-center flex-shrink-0">
                        <ResourceIcon type={res.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p dir="auto" className="text-sm font-medium text-slate-800 truncate text-left rtl:text-right">{res.title}</p>
                        <p className="text-xs text-slate-400">{t(RESOURCE_LABEL_KEYS[res.type])}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteRes(res.id)}
                        aria-label={t('common.delete')}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">{t('editor.res.none')}</p>
              )}
            </div>
          )}
        </div>

        {/* Save bar */}
        <div className="sticky bottom-0 bg-surface border-t border-slate-100 px-4 py-3">
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            <Save className="h-4 w-4" />
            {saving ? t('lesson.saving') : t('editor.lesson.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

const RESOURCE_LABEL_KEYS: Record<ResourceType, TKey> = {
  pdf: 'resource.pdf',
  file: 'resource.file',
  link: 'resource.link',
  telegram: 'resource.telegram',
};

function ResourceIcon({ type }: { type: ResourceType }) {
  switch (type) {
    case 'pdf': return <FileText className="h-4 w-4 text-slate-500" />;
    case 'file': return <Download className="h-4 w-4 text-slate-500" />;
    case 'link': return <LinkIcon className="h-4 w-4 text-slate-500" />;
    case 'telegram': return <Send className="h-4 w-4 text-slate-500" />;
  }
}
