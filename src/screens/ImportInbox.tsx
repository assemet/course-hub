import { useEffect, useState, useCallback } from 'react';
import {
  Inbox, Trash2, ArrowRight, Video, FileText, Link as LinkIcon,
  Image as ImageIcon, File as FileIcon, Type, RefreshCw,
} from 'lucide-react';
import { Card } from '@/components/Card';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState, EmptyState } from '@/components/StateViews';
import { AppHeader } from '@/components/AppHeader';
import { useUser } from '@/hooks/useUser';
import { fetchPendingImports, deleteImport, importMessageToLesson } from '@/lib/importService';
import { fetchCoursesByCreator, fetchModulesWithLessons } from '@/lib/courseService';
import { hapticFeedback } from '@/lib/telegram';
import type { ImportedMessage, ImportMediaType, Course, ModuleWithLessons } from '@/lib/types';

const mediaIcons: Record<ImportMediaType, typeof FileText> = {
  video: Video,
  pdf: FileText,
  text: Type,
  link: LinkIcon,
  image: ImageIcon,
  file: FileIcon,
};

const mediaBadgeColors: Record<ImportMediaType, string> = {
  video: 'bg-red-50 text-red-500',
  pdf: 'bg-orange-50 text-orange-500',
  text: 'bg-slate-100 text-slate-500',
  link: 'bg-blue-50 text-blue-500',
  image: 'bg-purple-50 text-purple-500',
  file: 'bg-teal-50 text-teal-500',
};

const mediaLabels: Record<ImportMediaType, string> = {
  video: 'Video',
  pdf: 'PDF',
  text: 'Text',
  link: 'Link',
  image: 'Image',
  file: 'File',
};

export function ImportInbox({ onBack }: { onBack: () => void }) {
  const { user } = useUser();
  const [imports, setImports] = useState<ImportedMessage[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modulesMap, setModulesMap] = useState<Record<string, ModuleWithLessons[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      const [pending, myCourses] = await Promise.all([
        fetchPendingImports(user.id),
        fetchCoursesByCreator(user.id),
      ]);
      setImports(pending);
      setCourses(myCourses);

      const modMap: Record<string, ModuleWithLessons[]> = {};
      for (const c of myCourses) {
        modMap[c.id] = await fetchModulesWithLessons(c.id);
      }
      setModulesMap(modMap);

      if (myCourses.length > 0 && !selectedCourse) {
        setSelectedCourse(myCourses[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load imports');
    } finally {
      setLoading(false);
    }
  }, [user, selectedCourse]);

  useEffect(() => {
    load();
  }, [load]);

  const handleImport = async (msg: ImportedMessage) => {
    if (!selectedCourse || !selectedModule) return;
    try {
      setImporting(msg.id);
      await importMessageToLesson(msg, selectedCourse, selectedModule);
      setImports(imports.filter((m) => m.id !== msg.id));
      hapticFeedback('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import message');
    } finally {
      setImporting(null);
    }
  };

  const handleDelete = async (msgId: string) => {
    if (!confirm('Delete this forwarded message?')) return;
    try {
      await deleteImport(msgId);
      setImports(imports.filter((m) => m.id !== msgId));
      hapticFeedback('warning');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const availableModules = selectedCourse ? modulesMap[selectedCourse] ?? [] : [];

  if (loading) return (
    <>
      <AppHeader title="Import Inbox" onBack={onBack} />
      <LoadingScreen message="Loading forwarded messages..." />
    </>
  );

  if (error) return (
    <>
      <AppHeader title="Import Inbox" onBack={onBack} />
      <ErrorState message={error} onRetry={load} />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title="Import Inbox"
        onBack={onBack}
        rightAction={
          <button
            onClick={load}
            className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 active:scale-90 transition-all"
          >
            <RefreshCw className="h-5 w-5 text-slate-600" />
          </button>
        }
      />

      <div className="px-4 py-5 space-y-5 pb-24">
        {/* Info banner */}
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
              <Inbox className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900">Forward messages to import</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Forward messages from your Telegram channel to the bot. They'll appear here for quick import into your courses.
              </p>
            </div>
          </div>
        </Card>

        {/* Target course/module selector */}
        {courses.length > 0 && (
          <Card className="p-4 space-y-3">
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Import to course</label>
              <select
                value={selectedCourse}
                onChange={(e) => {
                  setSelectedCourse(e.target.value);
                  setSelectedModule('');
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Module</label>
              <select
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a module...</option>
                {availableModules.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
            </div>
            {availableModules.length === 0 && (
              <p className="text-xs text-slate-400">This course has no modules yet. Add one in the course editor first.</p>
            )}
          </Card>
        )}

        {/* Pending imports */}
        {imports.length === 0 ? (
          <EmptyState
            title="No forwarded messages"
            description="Forward messages from your Telegram channel to the bot to see them here."
            icon={<Inbox className="h-7 w-7 text-slate-400" />}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                {imports.length} Pending {imports.length === 1 ? 'Message' : 'Messages'}
              </h2>
            </div>
            {imports.map((msg) => {
              const Icon = mediaIcons[msg.media_type] ?? Type;
              const canImport = !!selectedCourse && !!selectedModule && importing !== msg.id;
              return (
                <Card key={msg.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${mediaBadgeColors[msg.media_type]}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${mediaBadgeColors[msg.media_type]}`}>
                          {mediaLabels[msg.media_type]}
                        </span>
                        <span className="text-xs text-slate-400">
                          {new Date(msg.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 line-clamp-2">
                        {msg.parsed_title ?? 'Untitled'}
                      </p>
                      {msg.raw_content && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-3">
                          {msg.raw_content}
                        </p>
                      )}
                      {msg.media_url && (
                        <p className="text-xs text-blue-500 mt-1 truncate">{msg.media_url}</p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => handleImport(msg)}
                          disabled={!canImport}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 active:scale-95 disabled:opacity-40 transition-all"
                        >
                          {importing === msg.id ? (
                            <>
                              <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Importing...
                            </>
                          ) : (
                            <>
                              <ArrowRight className="h-3.5 w-3.5" />
                              Import to Module
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(msg.id)}
                          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-500 text-xs font-medium hover:bg-red-50 hover:text-red-500 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
