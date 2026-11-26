import { useEffect, useState, useCallback } from 'react';
import {
  Inbox, Trash2, ArrowRight, Video, FileText, Link as LinkIcon,
  Image as ImageIcon, File as FileIcon, Type, RefreshCw, Send, BookOpen, CheckCircle2,
} from 'lucide-react';
import { Card } from '@/components/Card';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState, EmptyState } from '@/components/StateViews';
import { AppHeader } from '@/components/AppHeader';
import { useUser } from '@/hooks/useUser';
import { useI18n, type TKey } from '@/lib/i18n';
import { fetchPendingImports, deleteImport, importMessageToLesson } from '@/lib/importService';
import { fetchCoursesByCreator, fetchModulesWithLessons } from '@/lib/courseService';
import { hapticFeedback, openTelegramLink } from '@/lib/telegram';
import { buildBotChatLink } from '@/lib/deepLink';
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

const mediaLabelKeys: Record<ImportMediaType, TKey> = {
  video: 'media.video',
  pdf: 'media.pdf',
  text: 'media.text',
  link: 'media.link',
  image: 'media.image',
  file: 'media.file',
};

export function ImportInbox({ onBack }: { onBack: () => void }) {
  const { user } = useUser();
  const { t, formatDate } = useI18n();
  const [imports, setImports] = useState<ImportedMessage[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [modulesMap, setModulesMap] = useState<Record<string, ModuleWithLessons[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); // fatal: inbox couldn't load
  const [actionError, setActionError] = useState<string | null>(null); // recoverable
  const [importing, setImporting] = useState<string | null>(null);
  const [justImported, setJustImported] = useState(false);
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
      const moduleLists = await Promise.all(myCourses.map((c) => fetchModulesWithLessons(c.id)));

      setImports(pending);
      setCourses(myCourses);
      setModulesMap(Object.fromEntries(myCourses.map((c, i) => [c.id, moduleLists[i]])));

    } catch (err) {
      setError(err instanceof Error ? err.message : t('inbox.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [user, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the import target valid after (re)loading: default to the first course and module.
  useEffect(() => {
    if (!courses.some((c) => c.id === selectedCourse)) {
      const firstId = courses[0]?.id ?? '';
      setSelectedCourse(firstId);
      setSelectedModule(modulesMap[firstId]?.[0]?.id ?? '');
    } else if (!(modulesMap[selectedCourse] ?? []).some((m) => m.id === selectedModule)) {
      setSelectedModule(modulesMap[selectedCourse]?.[0]?.id ?? '');
    }
  }, [courses, modulesMap, selectedCourse, selectedModule]);

  const handleCourseChange = (courseId: string) => {
    setSelectedCourse(courseId);
    setSelectedModule(modulesMap[courseId]?.[0]?.id ?? '');
  };

  const handleImport = async (msg: ImportedMessage) => {
    if (!selectedCourse || !selectedModule) return;
    try {
      setImporting(msg.id);
      setActionError(null);
      await importMessageToLesson(msg, selectedCourse, selectedModule);
      setImports((list) => list.filter((m) => m.id !== msg.id));
      hapticFeedback('success');
      setJustImported(true);
      setTimeout(() => setJustImported(false), 2000);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('inbox.importFailed'));
      hapticFeedback('error');
    } finally {
      setImporting(null);
    }
  };

  const handleDelete = async (msgId: string) => {
    if (!confirm(t('inbox.confirmDelete'))) return;
    try {
      setActionError(null);
      await deleteImport(msgId);
      setImports((list) => list.filter((m) => m.id !== msgId));
      hapticFeedback('warning');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('inbox.deleteFailed'));
    }
  };

  const availableModules = selectedCourse ? modulesMap[selectedCourse] ?? [] : [];

  if (loading) return (
    <>
      <AppHeader title={t('inbox.title')} onBack={onBack} />
      <LoadingScreen message={t('inbox.loading')} />
    </>
  );

  if (error) return (
    <>
      <AppHeader title={t('inbox.title')} onBack={onBack} />
      <ErrorState message={error} onRetry={load} />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader
        title={t('inbox.title')}
        onBack={onBack}
        rightAction={
          <button
            onClick={load}
            aria-label={t('common.refresh')}
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
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900">{t('inbox.banner.title')}</p>
              <p className="text-xs text-blue-600 mt-0.5">{t('inbox.banner.body')}</p>
              <button
                onClick={() => openTelegramLink(buildBotChatLink())}
                className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-blue-600 text-xs font-semibold border border-blue-200 active:scale-95 transition-all"
              >
                <Send className="h-3.5 w-3.5" />
                {t('inbox.openBot')}
              </button>
            </div>
          </div>
        </Card>

        {actionError && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {justImported && (
          <div className="flex items-center justify-center gap-1.5 text-green-600 text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {t('inbox.imported')}
          </div>
        )}

        {/* Target course/module selector */}
        {courses.length === 0 ? (
          <Card className="p-4">
            <EmptyState
              title={t('inbox.noCourses.title')}
              description={t('inbox.noCourses.desc')}
              icon={<BookOpen className="h-7 w-7 text-slate-400" />}
            />
          </Card>
        ) : (
          <Card className="p-4 space-y-3">
            <div>
              <label htmlFor="import-course" className="text-sm font-medium text-slate-700 block mb-1.5">
                {t('inbox.targetCourse')}
              </label>
              <select
                id="import-course"
                value={selectedCourse}
                onChange={(e) => handleCourseChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="import-module" className="text-sm font-medium text-slate-700 block mb-1.5">
                {t('inbox.module')}
              </label>
              <select
                id="import-module"
                value={selectedModule}
                onChange={(e) => setSelectedModule(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {availableModules.length === 0 && <option value="">{t('inbox.selectModule')}</option>}
                {availableModules.map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </select>
            </div>
            {availableModules.length === 0 && (
              <p className="text-xs text-slate-400">{t('inbox.noModules')}</p>
            )}
          </Card>
        )}

        {/* Pending imports */}
        {imports.length === 0 ? (
          <EmptyState
            title={t('inbox.empty.title')}
            description={t('inbox.empty.desc')}
            icon={<Inbox className="h-7 w-7 text-slate-400" />}
          />
        ) : (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-500 tracking-wide">
              {t('inbox.pendingCount', { n: imports.length })}
            </h2>
            {imports.map((msg) => {
              const Icon = mediaIcons[msg.media_type] ?? Type;
              const canImport = !!selectedCourse && !!selectedModule && importing === null;
              return (
                <Card key={msg.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${mediaBadgeColors[msg.media_type]}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${mediaBadgeColors[msg.media_type]}`}>
                          {t(mediaLabelKeys[msg.media_type] ?? 'media.text')}
                        </span>
                        <span className="text-xs text-slate-400">{formatDate(msg.created_at)}</span>
                      </div>
                      <p dir="auto" className="text-sm font-semibold text-slate-900 line-clamp-2 text-left rtl:text-right">
                        {msg.parsed_title ?? t('common.untitled')}
                      </p>
                      {msg.raw_content && (
                        <p dir="auto" className="text-xs text-slate-500 mt-1 line-clamp-3 text-start">
                          {msg.raw_content}
                        </p>
                      )}
                      {msg.media_url && (
                        <p dir="ltr" className="text-xs text-blue-500 mt-1 truncate text-start">{msg.media_url}</p>
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
                              {t('inbox.importing')}
                            </>
                          ) : (
                            <>
                              <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
                              {t('inbox.importToModule')}
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(msg.id)}
                          aria-label={t('common.delete')}
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
