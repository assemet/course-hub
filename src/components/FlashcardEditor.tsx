import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Plus, Trash2, Edit2, Layers, ClipboardPaste, AlertCircle } from 'lucide-react';
import { Card } from '@/components/Card';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { useBackButton } from '@/hooks/useBackButton';
import { hapticFeedback } from '@/lib/telegram';
import {
  fetchModuleCards, addCards, updateCard, deleteCard, parseBulkCards, type Flashcard,
} from '@/lib/flashcardService';

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-surface text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

function CardForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Flashcard | null;
  onSave: (front: string, back: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [front, setFront] = useState(initial?.front ?? '');
  const [back, setBack] = useState(initial?.back ?? '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const save = async () => {
    if (!front.trim() || !back.trim()) return setFormError(t('cardEditor.err.both'));
    try {
      setSaving(true);
      setFormError(null);
      await onSave(front.trim(), back.trim());
    } catch (err) {
      setFormError(errorMessage(err, t('quizEditor.err.save')));
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 space-y-3 border-blue-300">
      <div>
        <label htmlFor="card-front" className="text-sm font-medium text-slate-700 block mb-1.5">{t('cardEditor.front')}</label>
        <textarea id="card-front" value={front} onChange={(e) => setFront(e.target.value)} rows={2} maxLength={500} dir="auto"
          placeholder={t('cardEditor.frontPh')} className={`${inputCls} resize-none`} />
      </div>
      <div>
        <label htmlFor="card-back" className="text-sm font-medium text-slate-700 block mb-1.5">{t('cardEditor.back')}</label>
        <textarea id="card-back" value={back} onChange={(e) => setBack(e.target.value)} rows={3} maxLength={1000} dir="auto"
          placeholder={t('cardEditor.backPh')} className={`${inputCls} resize-none`} />
      </div>
      {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] transition-all">
          {saving ? t('lesson.saving') : t('cardEditor.save')}
        </button>
        <button onClick={onCancel} disabled={saving} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">
          {t('common.cancel')}
        </button>
      </div>
    </Card>
  );
}

/** Paste many cards at once: one "front | back" per line. */
function BulkForm({ onSave, onCancel }: { onSave: (cards: Array<{ front: string; back: string }>) => Promise<void>; onCancel: () => void }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const parsed = useMemo(() => parseBulkCards(text), [text]);

  const save = async () => {
    if (parsed.cards.length === 0) return;
    try {
      setSaving(true);
      setFormError(null);
      await onSave(parsed.cards);
    } catch (err) {
      setFormError(errorMessage(err, t('quizEditor.err.save')));
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 space-y-3 border-blue-300">
      <div>
        <label htmlFor="bulk" className="text-sm font-medium text-slate-700 block mb-1">{t('cardEditor.bulkTitle')}</label>
        <p className="text-xs text-slate-500 mb-2">{t('cardEditor.bulkHint')}</p>
        <textarea id="bulk" value={text} onChange={(e) => setText(e.target.value)} rows={8} dir="auto"
          placeholder={'apple | تفاحة\nbook | كتاب\nالخلية | الوحدة الأساسية للحياة'}
          className={`${inputCls} resize-y font-mono text-[13px]`} />
      </div>
      {text.trim() && (
        <p className="text-xs text-slate-600">
          {t('cardEditor.bulkReady', { n: parsed.cards.length })}
          {parsed.badLines.length > 0 && (
            <span className="ms-1 inline-flex items-center gap-1 text-amber-600">
              <AlertCircle className="h-3 w-3" />
              {t('cardEditor.bulkBad', { lines: parsed.badLines.slice(0, 5).join(', ') })}
            </span>
          )}
        </p>
      )}
      {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={saving || parsed.cards.length === 0}
          className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-all">
          {saving ? t('lesson.saving') : t('cardEditor.bulkSave', { n: parsed.cards.length })}
        </button>
        <button onClick={onCancel} disabled={saving} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium">
          {t('common.cancel')}
        </button>
      </div>
    </Card>
  );
}

/** Full-screen editor for one module's flashcards. */
export function FlashcardEditor({ moduleId, moduleTitle, onClose }: { moduleId: string; moduleTitle: string; onClose: () => void }) {
  const { t } = useI18n();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // null = closed; 'new' | 'bulk' | card id being edited
  const [editing, setEditing] = useState<string | null>(null);

  useBackButton(onClose);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setCards(await fetchModuleCards(moduleId));
    } catch (err) {
      setError(errorMessage(err, t('cardEditor.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [moduleId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const nextPosition = cards.length > 0 ? Math.max(...cards.map((c) => c.position)) + 1 : 0;

  const add = async (list: Array<{ front: string; back: string }>) => {
    await addCards(moduleId, nextPosition, list);
    hapticFeedback('success');
    setEditing(null);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('cardEditor.confirmDelete'))) return;
    try {
      setActionError(null);
      await deleteCard(id);
      setCards((list) => list.filter((c) => c.id !== id));
    } catch (err) {
      setActionError(errorMessage(err, t('quizEditor.err.delete')));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="card-editor-title">
      <div className="max-w-lg mx-auto">
        <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur-md border-b border-slate-200/60 flex items-center gap-3 px-4 h-14">
          <div className="flex-1 min-w-0">
            <h1 id="card-editor-title" className="text-base font-bold text-slate-900 truncate">{t('cardEditor.title')}</h1>
            <p dir="auto" className="text-xs text-slate-500 truncate text-start">{moduleTitle}</p>
          </div>
          <button onClick={onClose} aria-label={t('common.close')} className="h-9 w-9 rounded-xl flex items-center justify-center hover:bg-slate-100">
            <X className="h-5 w-5 text-slate-600" />
          </button>
        </header>

        {loading ? (
          <LoadingScreen />
        ) : error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <div className="px-4 py-5 space-y-3 pb-24">
            {actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}

            {/* Add actions */}
            {editing === null && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setEditing('new')}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-semibold">
                  <Plus className="h-4 w-4" /> {t('cardEditor.add')}
                </button>
                <button onClick={() => setEditing('bulk')}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-semibold">
                  <ClipboardPaste className="h-4 w-4" /> {t('cardEditor.bulk')}
                </button>
              </div>
            )}
            {editing === 'new' && <CardForm initial={null} onSave={(f, b) => add([{ front: f, back: b }])} onCancel={() => setEditing(null)} />}
            {editing === 'bulk' && <BulkForm onSave={add} onCancel={() => setEditing(null)} />}

            {cards.length === 0 && editing === null && (
              <div className="text-center py-8">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <Layers className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700">{t('cardEditor.empty.title')}</p>
                <p className="text-xs text-slate-500 mt-1">{t('cardEditor.empty.desc')}</p>
              </div>
            )}

            {cards.length > 0 && (
              <p className="text-xs font-semibold text-slate-500 pt-2">{t('cardEditor.count', { n: cards.length })}</p>
            )}
            {cards.map((c) =>
              editing === c.id ? (
                <CardForm key={c.id} initial={c}
                  onSave={async (f, b) => {
                    await updateCard(c.id, f, b);
                    setEditing(null);
                    await load();
                  }}
                  onCancel={() => setEditing(null)} />
              ) : (
                <Card key={c.id} className="p-0 overflow-hidden">
                  <div className="flex items-stretch">
                    <div className="flex-1 min-w-0 p-3 border-e border-slate-100">
                      <p dir="auto" className="text-sm font-semibold text-slate-900 text-start whitespace-pre-wrap break-words">{c.front}</p>
                    </div>
                    <div className="flex-1 min-w-0 p-3 bg-slate-50">
                      <p dir="auto" className="text-sm text-slate-600 text-start whitespace-pre-wrap break-words">{c.back}</p>
                    </div>
                    <div className="flex flex-col justify-center px-1">
                      <button onClick={() => setEditing(c.id)} aria-label={t('cardEditor.edit')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(c.id)} aria-label={t('common.delete')} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
