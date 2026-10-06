import { useEffect, useState, useCallback } from 'react';
import {
  Plus, ChevronDown, ChevronUp, Trash2, Edit2,
  Save, X, Globe, GlobeLock, FileText, Link as LinkIcon, Download, Send,
  BookOpen,
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
import { hapticFeedback } from '@/lib/telegram';
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
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<ModuleWithLessons[]>([]);
  const [view, setView] = useState<EditView>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError('Course not found');
        setLoading(false);
        return;
      }
      setCourse(c);
      setTitle(c.title);
      setDescription(c.description ?? '');
      setCoverUrl(c.cover_url ?? '');
      setSlug(c.slug ?? '');

      const mods = await fetchModulesWithLessons(courseId);
      setModules(mods);
      if (mods.length > 0) {
        setExpandedModules(new Set([mods[0].id]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load course');
    } finally {
      setLoading(false);
    }
  }, [user, courseId, isNew]);

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
    try {
      setSaving(true);
      if (course) {
        const { error: updErr } = await supabase
          .from('courses')
          .update({
            title: title.trim(),
            description: description.trim() || null,
            cover_url: coverUrl.trim() || null,
            slug: slug.trim() || null,
          })
          .eq('id', course.id);
        if (updErr) throw updErr;
        setCourse({ ...course, title: title.trim(), description: description.trim() || null, cover_url: coverUrl.trim() || null, slug: slug.trim() || null });
      } else {
        const { data, error: insErr } = await supabase
          .from('courses')
          .insert({
            creator_id: user.id,
            title: title.trim(),
            description: description.trim() || null,
            cover_url: coverUrl.trim() || null,
            slug: slug.trim() || null,
            status: 'draft',
          })
          .select()
          .single();
        if (insErr) throw insErr;
        setCourse(data as Course);
        setView('modules');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save course');
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
      setError(err instanceof Error ? err.message : 'Failed to update status');
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
      setError(err instanceof Error ? err.message : 'Failed to add module');
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
      setError(err instanceof Error ? err.message : 'Failed to rename module');
    }
  };

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm('Delete this module and all its lessons?')) return;
    try {
      const { error: err } = await supabase.from('modules').delete().eq('id', moduleId);
      if (err) throw err;
      setModules(modules.filter((m) => m.id !== moduleId));
      hapticFeedback('warning');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete module');
    }
  };

  const handleReorderModule = async (moduleId: string, direction: 'up' | 'down') => {
    const idx = modules.findIndex((m) => m.id === moduleId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= modules.length) return;

    const newModules = [...modules];
    [newModules[idx], newModules[swapIdx]] = [newModules[swapIdx], newModules[idx]];

    // Update positions
    for (let i = 0; i < newModules.length; i++) {
      await supabase.from('modules').update({ position: i }).eq('id', newModules[i].id);
    }
    setModules(newModules);
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
    try {
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
      setError(err instanceof Error ? err.message : 'Failed to save lesson');
    }
  };

  const handleDeleteLesson = async (moduleId: string, lessonId: string) => {
    if (!confirm('Delete this lesson?')) return;
    try {
      const { error: err } = await supabase.from('lessons').delete().eq('id', lessonId);
      if (err) throw err;
      setModules(modules.map((m) =>
        m.id === moduleId ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) } : m
      ));
      hapticFeedback('warning');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete lesson');
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

    for (let i = 0; i < newLessons.length; i++) {
      await supabase.from('lessons').update({ position: i }).eq('id', newLessons[i].id);
    }

    setModules(modules.map((m) =>
      m.id === moduleId ? { ...m, lessons: newLessons } : m
    ));
  };

  // === Resource CRUD ===
  const handleAddResource = async (lessonId: string, resource: { title: string; type: ResourceType; url: string; description: string }) => {
    if (!resource.title.trim() || !resource.url.trim()) return;
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
      setError(err instanceof Error ? err.message : 'Failed to add resource');
    }
  };

  const handleDeleteResource = async (resourceId: string) => {
    try {
      const { error: err } = await supabase.from('resources').delete().eq('id', resourceId);
      if (err) throw err;
      hapticFeedback('warning');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete resource');
    }
  };

  if (loading) return (
    <>
      <AppHeader title={isNew ? 'Create Course' : 'Edit Course'} onBack={onBack} />
      <LoadingScreen message="Loading..." />
    </>
  );

  if (error) return (
    <>
      <AppHeader title={isNew ? 'Create Course' : 'Edit Course'} onBack={onBack} />
      <ErrorState message={error} onRetry={load} />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title={isNew ? 'Create Course' : course?.title ?? 'Edit Course'}
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
                <><GlobeLock className="h-3.5 w-3.5" /> Unpublish</>
              ) : (
                <><Globe className="h-3.5 w-3.5" /> Publish</>
              )}
            </button>
          ) : null
        }
      />

      {/* View tabs */}
      {course && (
        <div className="flex border-b border-slate-200 bg-white px-4 gap-1">
          <TabButton active={view === 'overview'} onClick={() => setView('overview')} label="Overview" />
          <TabButton active={view === 'modules'} onClick={() => setView('modules')} label="Modules" />
        </div>
      )}

      <div className="px-4 py-5 space-y-5 pb-24">
        {view === 'overview' && (
          <div className="space-y-4">
            <Card className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Course Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Python for Beginners"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short course description"
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Cover Image URL (optional)</label>
                <input
                  type="text"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Course Slug (optional)</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="python-for-beginners"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleSaveCourse}
                disabled={saving || !title.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 active:scale-[0.98] disabled:opacity-50 transition-all"
              >
                <Save className="h-4 w-4" />
                {course ? 'Save Changes' : 'Create Course'}
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
                      Status: {course.status === 'published' ? 'Published' : 'Draft'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {course.status === 'published'
                        ? 'Students can see and enroll in this course'
                        : 'Only you can see this course'}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {view === 'modules' && course && (
          <div className="space-y-4">
            {/* Add module */}
            <Card className="p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editingModuleId === null ? moduleTitleInput : ''}
                  onChange={(e) => setModuleTitleInput(e.target.value)}
                  placeholder="New module title"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddModule()}
                />
                <button
                  onClick={handleAddModule}
                  disabled={!moduleTitleInput.trim()}
                  className="flex items-center gap-1 px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 active:scale-95 disabled:opacity-50 transition-all"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
            </Card>

            {/* Modules list */}
            {modules.length === 0 ? (
              <EmptyState
                title="No modules yet"
                description="Add your first module above to start building the course structure."
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
                            className="text-slate-300 enabled:hover:text-slate-600 disabled:opacity-30 transition-colors"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleReorderModule(module.id, 'down')}
                            disabled={mIdx === modules.length - 1}
                            className="text-slate-300 enabled:hover:text-slate-600 disabled:opacity-30 transition-colors"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          onClick={() => toggleModule(module.id)}
                          className="flex-1 flex items-center gap-2 text-left min-w-0"
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
                              className="flex-1 px-2 py-1 rounded-lg border border-blue-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">{module.title}</p>
                              <p className="text-xs text-slate-400">{module.lessons.length} lessons</p>
                            </div>
                          )}
                          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                        </button>
                        <button
                          onClick={() => { setEditingModuleId(module.id); setModuleTitleInput(module.title); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteModule(module.id)}
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
                                  className="text-slate-300 enabled:hover:text-slate-600 disabled:opacity-30 transition-colors"
                                >
                                  <ChevronUp className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => handleReorderLesson(module.id, lesson.id, 'down')}
                                  disabled={lIdx === module.lessons.length - 1}
                                  className="text-slate-300 enabled:hover:text-slate-600 disabled:opacity-30 transition-colors"
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </button>
                              </div>
                              <button
                                onClick={() => setEditingLesson({ moduleId: module.id, lesson })}
                                className="flex-1 flex items-center gap-2 text-left min-w-0"
                              >
                                <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                                <span className="text-sm text-slate-700 truncate">{lesson.title}</span>
                              </button>
                              <button
                                onClick={() => setEditingLesson({ moduleId: module.id, lesson })}
                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteLesson(module.id, lesson.id)}
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
                            Add Lesson
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
        className="bg-white w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-lg font-bold text-slate-900">
            {lesson ? 'Edit Lesson' : 'New Lesson'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 active:scale-90 transition-all"
          >
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Lesson Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Introduction to Variables"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write the lesson content here..."
              rows={6}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1.5">Telegram Content URL (optional)</label>
            <input
              type="text"
              value={telegramUrl}
              onChange={(e) => setTelegramUrl(e.target.value)}
              placeholder="https://t.me/..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Resources section — only for existing lessons */}
          {lesson && (
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-slate-700">Resources</label>
                <button
                  onClick={() => setShowResourceForm(!showResourceForm)}
                  className="flex items-center gap-1 text-blue-500 text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>

              {showResourceForm && (
                <div className="space-y-2 p-3 rounded-xl bg-slate-50 mb-3">
                  <input
                    type="text"
                    value={resTitle}
                    onChange={(e) => setResTitle(e.target.value)}
                    placeholder="Resource title"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={resType}
                    onChange={(e) => setResType(e.target.value as ResourceType)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="link">External Link</option>
                    <option value="pdf">PDF</option>
                    <option value="file">File</option>
                    <option value="telegram">Telegram Link</option>
                  </select>
                  <input
                    type="text"
                    value={resUrl}
                    onChange={(e) => setResUrl(e.target.value)}
                    placeholder="URL"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="text"
                    value={resDesc}
                    onChange={(e) => setResDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddRes}
                      disabled={!resTitle.trim() || !resUrl.trim()}
                      className="flex-1 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-all"
                    >
                      Save Resource
                    </button>
                    <button
                      onClick={() => setShowResourceForm(false)}
                      className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 text-sm font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {resources.length > 0 ? (
                <div className="space-y-2">
                  {resources.map((res) => (
                    <div key={res.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50">
                      <div className="h-8 w-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                        <ResourceIcon type={res.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{res.title}</p>
                        <p className="text-xs text-slate-400 uppercase">{res.type}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteRes(res.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No resources yet</p>
              )}
            </div>
          )}
        </div>

        {/* Save bar */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-4 py-3">
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 active:scale-[0.98] disabled:opacity-50 transition-all"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Lesson'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResourceIcon({ type }: { type: ResourceType }) {
  switch (type) {
    case 'pdf': return <FileText className="h-4 w-4 text-slate-500" />;
    case 'file': return <Download className="h-4 w-4 text-slate-500" />;
    case 'link': return <LinkIcon className="h-4 w-4 text-slate-500" />;
    case 'telegram': return <Send className="h-4 w-4 text-slate-500" />;
  }
}
