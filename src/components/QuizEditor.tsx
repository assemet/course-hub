import { useCallback, useEffect, useState } from 'react';
import { X, Plus, Trash2, Edit2, Check, ShieldCheck, ClipboardList, ImagePlus, RefreshCw } from 'lucide-react';
import { Card } from '@/components/Card';
import { LoadingScreen, Spinner } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { MediaThumb } from '@/components/MediaThumb';
import { QuestionImage } from '@/components/QuestionImage';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { useBackButton } from '@/hooks/useBackButton';
import { useUser } from '@/hooks/useUser';
import { hapticFeedback, openTelegramLink } from '@/lib/telegram';
import { buildBotChatLink } from '@/lib/deepLink';
import { fetchAllImports, markImportAsImported } from '@/lib/importService';
import type { ImportedMessage } from '@/lib/types';
import {
  fetchCreatorQuiz, ensureQuiz, updatePassPercent, addQuestion, updateQuestion, deleteQuestion, optionLabel,
  TRUE_FALSE_OPTIONS,
  type CreatorQuiz, type EditableQuestion, type QuestionInput, type QuestionKind,
} from '@/lib/quizService';

const PASS_MARKS = [50, 60, 70, 80, 90, 100];
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-surface text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';

/** How many recent pictures the picker offers. */
const PICKER_LIMIT = 24;

/** Recent pictures the creator sent to the bot, to attach one to a question. */
function ImagePicker({
  onPick,
  onCancel,
}: {
  onPick: (item: ImportedMessage) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const { user } = useUser();
  const [items, setItems] = useState<ImportedMessage[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setFailed(false);
      const all = await fetchAllImports(user.id);
      setItems(all.filter((m) => m.media_type === 'image' && m.file_id).slice(0, PICKER_LIMIT));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{t('quizEditor.pickImage')}</p>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('common.close')}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{t('quizEditor.imageHint')}</p>

      {items === null && !failed ? (
        <div className="py-6 flex justify-center">
          <Spinner />
        </div>
      ) : failed ? (
        <p role="alert" className="mt-3 text-xs text-red-600">{t('quizEditor.imagesFailed')}</p>
      ) : items && items.length === 0 ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">{t('quizEditor.noImages')}</p>
      ) : (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {items!.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onPick(m)}
              aria-label={m.parsed_title || m.file_name || t('quizEditor.pickImage')}
              className="rounded-xl ring-offset-2 focus-visible:ring-2 focus-visible:ring-blue-500 active:scale-95 transition-transform"
            >
              <MediaThumb
                source={{ importId: m.id }}
                mediaType="image"
                hasThumb={!!m.thumb_file_id}
                className="aspect-square w-full"
              />
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-4">
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('quizEditor.refresh')}
        </button>
        <button
          type="button"
          onClick={() => openTelegramLink(buildBotChatLink())}
          className="text-xs font-semibold text-blue-600"
        >
          {t('inbox.openBot')}
        </button>
      </div>
    </div>
  );
}

/** The picture chosen for a question: the saved one, or one picked from the bot inbox. */
type ChosenImage =
  | { fileId: string; savedQuestionId: string }
  | { fileId: string; item: ImportedMessage };

/** Add or edit one question. */
function QuestionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: EditableQuestion | null;
  onSave: (input: QuestionInput) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const initialKind: QuestionKind = initial?.kind ?? 'choice';
  const [kind, setKind] = useState<QuestionKind>(initialKind);
  const [question, setQuestion] = useState(initial?.question ?? '');
  // Each type keeps its own answers, so switching back and forth loses nothing.
  const [options, setOptions] = useState<string[]>(initialKind === 'choice' && initial ? initial.options : ['', '', '']);
  const [correct, setCorrect] = useState<number>(initialKind === 'choice' && initial ? initial.correct_index : -1);
  const [tfCorrect, setTfCorrect] = useState<number>(initialKind === 'true_false' && initial ? initial.correct_index : -1);
  const [image, setImage] = useState<ChosenImage | null>(
    initial?.image_file_id ? { fileId: initial.image_file_id, savedQuestionId: initial.id } : null
  );
  const [picking, setPicking] = useState(false);
  const [explanation, setExplanation] = useState(initial?.explanation ?? '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const setOption = (i: number, value: string) => setOptions((o) => o.map((x, j) => (j === i ? value : x)));
  const removeOption = (i: number) => {
    setOptions((o) => o.filter((_, j) => j !== i));
    setCorrect((c) => (c === i ? -1 : c > i ? c - 1 : c));
  };

  const save = async () => {
    if (!question.trim()) return setFormError(t('quizEditor.err.question'));
    let finalOptions: string[];
    let finalCorrect: number;
    if (kind === 'true_false') {
      if (tfCorrect !== 0 && tfCorrect !== 1) return setFormError(t('quizEditor.err.correct'));
      finalOptions = TRUE_FALSE_OPTIONS;
      finalCorrect = tfCorrect;
    } else {
      finalOptions = options.map((o) => o.trim());
      if (finalOptions.some((o) => !o)) return setFormError(t('quizEditor.err.emptyOption'));
      if (new Set(finalOptions).size !== finalOptions.length) return setFormError(t('quizEditor.err.duplicate'));
      if (correct < 0 || correct >= finalOptions.length) return setFormError(t('quizEditor.err.correct'));
      finalCorrect = correct;
    }
    try {
      setSaving(true);
      setFormError(null);
      await onSave({
        question: question.trim(),
        options: finalOptions,
        correct_index: finalCorrect,
        explanation: explanation.trim() || null,
        kind,
        image_file_id: image?.fileId ?? null,
      });
      // A picture used here shouldn't wait in the import inbox as a lesson.
      if (image && 'item' in image && image.item.status === 'pending') {
        markImportAsImported(image.item.id).catch(() => {});
      }
    } catch (err) {
      setFormError(errorMessage(err, t('quizEditor.err.save')));
      setSaving(false);
    }
  };

  return (
    <Card className="p-4 space-y-4 border border-blue-300">
      <div>
        <label htmlFor="q-text" className="text-sm font-medium text-slate-700 block mb-1.5">{t('quizEditor.question')}</label>
        <textarea
          id="q-text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          maxLength={500}
          dir="auto"
          placeholder={t('quizEditor.questionPh')}
          className={`${inputCls} resize-none`}
        />
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700 mb-1.5">{t('quizEditor.image')}</p>
        {picking ? (
          <ImagePicker
            onPick={(item) => {
              setImage({ fileId: item.file_id!, item });
              setPicking(false);
              hapticFeedback('light');
            }}
            onCancel={() => setPicking(false)}
          />
        ) : image ? (
          <div>
            {'item' in image ? (
              <MediaThumb
                source={{ importId: image.item.id }}
                mediaType="image"
                hasThumb={!!image.item.thumb_file_id}
                className="h-44 w-full bg-slate-100"
                iconClassName="h-8 w-8"
                fit="contain"
              />
            ) : (
              <QuestionImage questionId={image.savedQuestionId} imageFileId={image.fileId} />
            )}
            <div className="mt-2 flex items-center gap-4">
              <button type="button" onClick={() => setPicking(true)} className="text-xs font-semibold text-blue-600">
                {t('quizEditor.changeImage')}
              </button>
              <button type="button" onClick={() => setImage(null)} className="text-xs font-semibold text-red-600">
                {t('quizEditor.removeImage')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-slate-300 text-slate-600 text-sm font-medium"
          >
            <ImagePlus className="h-4 w-4" /> {t('quizEditor.addImage')}
          </button>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700 mb-1.5">{t('quizEditor.kind')}</p>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label={t('quizEditor.kind')}>
          {(['choice', 'true_false'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => {
                setKind(k);
                setFormError(null);
              }}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                kind === k ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              {k === 'choice' ? t('quizEditor.kind.choice') : t('quizEditor.kind.trueFalse')}
            </button>
          ))}
        </div>
      </div>

      {kind === 'true_false' ? (
        <div>
          <p className="text-sm font-medium text-slate-700 mb-1">{t('quizEditor.correctLabel')}</p>
          <p className="text-xs text-slate-400 mb-2">{t('quizEditor.tfHint')}</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('quizEditor.correctLabel')}>
            {TRUE_FALSE_OPTIONS.map((opt, i) => (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={tfCorrect === i}
                onClick={() => {
                  setTfCorrect(i);
                  setFormError(null);
                }}
                className={`flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-semibold transition-colors ${
                  tfCorrect === i ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                {tfCorrect === i && <Check className="h-4 w-4" strokeWidth={3} />}
                {optionLabel({ kind: 'true_false' }, opt, t)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium text-slate-700 mb-1">{t('quizEditor.options')}</p>
          <p className="text-xs text-slate-400 mb-2">{t('quizEditor.optionsHint')}</p>
          <div className="space-y-2" role="radiogroup" aria-label={t('quizEditor.correctLabel')}>
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={correct === i}
                  aria-label={t('quizEditor.markCorrect', { n: i + 1 })}
                  onClick={() => {
                    setCorrect(i);
                    setFormError(null);
                  }}
                  className={`h-8 w-8 flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                    correct === i ? 'bg-green-500 border-green-500' : 'border-slate-300'
                  }`}
                >
                  {correct === i && <Check className="h-4 w-4 text-white" strokeWidth={3} />}
                </button>
                <input
                  value={opt}
                  onChange={(e) => setOption(i, e.target.value)}
                  maxLength={200}
                  dir="auto"
                  placeholder={t('quizEditor.optionPh', { n: i + 1 })}
                  className={inputCls}
                />
                {options.length > MIN_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    aria-label={t('common.delete')}
                    className="h-8 w-8 flex-shrink-0 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={() => setOptions((o) => [...o, ''])}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-blue-600"
            >
              <Plus className="h-3.5 w-3.5" /> {t('quizEditor.addOption')}
            </button>
          )}
        </div>
      )}

      <div>
        <label htmlFor="q-expl" className="text-sm font-medium text-slate-700 block mb-1.5">{t('quizEditor.explanation')}</label>
        <textarea
          id="q-expl"
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={2}
          maxLength={1000}
          dir="auto"
          placeholder={t('quizEditor.explanationPh')}
          className={`${inputCls} resize-none`}
        />
      </div>

      {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}

      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold disabled:opacity-60 active:scale-[0.98] transition-all"
        >
          {saving ? t('lesson.saving') : t('quizEditor.saveQuestion')}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium"
        >
          {t('common.cancel')}
        </button>
      </div>
    </Card>
  );
}

/** Full-screen editor for one module's quiz. */
export function QuizEditor({
  moduleId,
  moduleTitle,
  onClose,
}: {
  moduleId: string;
  moduleTitle: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [quiz, setQuiz] = useState<CreatorQuiz | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // null = no form open; 'new' = adding; otherwise the id being edited
  const [editing, setEditing] = useState<string | null>(null);

  useBackButton(onClose);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setQuiz(await fetchCreatorQuiz(moduleId));
    } catch (err) {
      setError(errorMessage(err, t('quizEditor.loadFailed')));
    } finally {
      setLoading(false);
    }
  }, [moduleId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const questions = quiz?.questions ?? [];

  const handleAdd = async (input: QuestionInput) => {
    const quizId = quiz?.id ?? (await ensureQuiz(moduleId));
    const position = questions.length > 0 ? Math.max(...questions.map((q) => q.position)) + 1 : 0;
    await addQuestion(quizId, position, input);
    hapticFeedback('success');
    setEditing(null);
    await load();
  };

  const handleUpdate = async (id: string, input: QuestionInput) => {
    await updateQuestion(id, input);
    hapticFeedback('success');
    setEditing(null);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('quizEditor.confirmDelete'))) return;
    try {
      setActionError(null);
      await deleteQuestion(id);
      await load();
    } catch (err) {
      setActionError(errorMessage(err, t('quizEditor.err.delete')));
    }
  };

  const handlePassMark = async (value: number) => {
    try {
      setActionError(null);
      const quizId = quiz?.id ?? (await ensureQuiz(moduleId));
      await updatePassPercent(quizId, value);
      setQuiz((q) => (q ? { ...q, pass_percent: value } : { id: quizId, module_id: moduleId, pass_percent: value, questions: [] }));
    } catch (err) {
      setActionError(errorMessage(err, t('quizEditor.err.save')));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="quiz-editor-title">
      <div className="max-w-lg mx-auto">
        <header className="sticky top-0 z-10 bg-surface/90 backdrop-blur-md border-b border-slate-200/60 flex items-center gap-3 px-4 h-14">
          <div className="flex-1 min-w-0">
            <h1 id="quiz-editor-title" className="text-base font-bold text-slate-900 truncate">{t('quizEditor.title')}</h1>
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
          <div className="px-4 py-5 space-y-4 pb-24">
            <div className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
              <ShieldCheck className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <p>{t('quizEditor.hint')}</p>
            </div>

            {/* Pass mark */}
            <Card className="p-4">
              <p className="text-sm font-semibold text-slate-900">{t('quizEditor.passMark')}</p>
              <p className="text-xs text-slate-500 mt-0.5 mb-3">{t('quizEditor.passMarkHint')}</p>
              <div className="flex flex-wrap gap-2">
                {PASS_MARKS.map((v) => {
                  const active = (quiz?.pass_percent ?? 70) === v;
                  return (
                    <button
                      key={v}
                      onClick={() => handlePassMark(v)}
                      aria-pressed={active}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border tabular-nums ${
                        active ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {v}%
                    </button>
                  );
                })}
              </div>
            </Card>

            {actionError && <p role="alert" className="text-sm text-red-600">{actionError}</p>}

            {/* Questions */}
            {questions.length === 0 && editing !== 'new' && (
              <div className="text-center py-8">
                <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                  <ClipboardList className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700">{t('quizEditor.empty.title')}</p>
                <p className="text-xs text-slate-500 mt-1">{t('quizEditor.empty.desc')}</p>
              </div>
            )}

            {questions.map((q, i) =>
              editing === q.id ? (
                <QuestionForm key={q.id} initial={q} onSave={(input) => handleUpdate(q.id, input)} onCancel={() => setEditing(null)} />
              ) : (
                <Card key={q.id} className="p-4">
                  <div className="flex items-start gap-2">
                    <span className="h-6 w-6 rounded-full bg-slate-100 text-xs font-bold text-slate-500 flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <p dir="auto" className="flex-1 text-sm font-semibold text-slate-900 text-start whitespace-pre-wrap">{q.question}</p>
                    <button onClick={() => setEditing(q.id)} aria-label={t('quizEditor.editQuestion')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(q.id)} aria-label={t('common.delete')} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {q.image_file_id && <QuestionImage questionId={q.id} imageFileId={q.image_file_id} />}
                  <ul className={`mt-3 ${q.kind === 'true_false' ? 'grid grid-cols-2 gap-1.5' : 'space-y-1.5'}`}>
                    {q.options.map((opt, j) => (
                      <li
                        key={j}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                          j === q.correct_index ? 'bg-green-50 text-green-700 font-medium' : 'bg-slate-50 text-slate-600'
                        }`}
                      >
                        {j === q.correct_index ? <Check className="h-4 w-4 flex-shrink-0" strokeWidth={3} /> : <span className="h-4 w-4 flex-shrink-0" />}
                        <span dir="auto" className="flex-1 text-start">{optionLabel(q, opt, t)}</span>
                      </li>
                    ))}
                  </ul>
                  {q.explanation && (
                    <p dir="auto" className="mt-2 text-xs text-slate-500 text-start">💡 {q.explanation}</p>
                  )}
                </Card>
              )
            )}

            {editing === 'new' ? (
              <QuestionForm initial={null} onSave={handleAdd} onCancel={() => setEditing(null)} />
            ) : (
              <button
                onClick={() => setEditing('new')}
                disabled={editing !== null}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 text-sm font-semibold disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> {t('quizEditor.addQuestion')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
