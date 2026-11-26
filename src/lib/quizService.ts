import { supabase } from './supabase';
import type { ModuleWithLessons } from './types';

// Columns students may read. `correct_index` and `explanation` are hidden by
// column privileges; selecting `*` would fail for students.
const PUBLIC_QUESTION_COLUMNS = 'id, quiz_id, position, question, options';

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  position: number;
  question: string;
  options: string[];
}

/** A question as the course owner sees it (with the answer). */
export interface EditableQuestion {
  id: string;
  position: number;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
}

export interface CreatorQuiz {
  id: string;
  module_id: string;
  pass_percent: number;
  questions: EditableQuestion[];
}

export interface QuizStatus {
  quiz_id: string;
  module_id: string;
  pass_percent: number;
  question_count: number;
  attempts: number;
  best_score: number | null;
  best_total: number | null;
  passed: boolean;
}

export interface QuizResult {
  score: number;
  total: number;
  passed: boolean;
  pass_percent: number;
  results: Array<{
    question_id: string;
    chosen: number;
    correct_index: number;
    is_correct: boolean;
    explanation: string | null;
  }>;
}

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

/** Per-module quiz status for the current user (no answers). */
export async function fetchCourseQuizStatus(courseId: string): Promise<Map<string, QuizStatus>> {
  const { data, error } = await supabase.rpc('course_quiz_status', { p_course_id: courseId });
  if (error) throw error;
  return new Map(((data ?? []) as QuizStatus[]).map((s) => [s.module_id, s]));
}

export async function fetchQuizQuestions(quizId: string): Promise<QuizQuestion[]> {
  const { data, error } = await supabase
    .from('quiz_questions')
    .select(PUBLIC_QUESTION_COLUMNS)
    .eq('quiz_id', quizId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as QuizQuestion[];
}

/** Graded in the database; `answers[i]` is the chosen option of question i (-1 = none). */
export async function submitQuiz(quizId: string, answers: number[]): Promise<QuizResult> {
  const { data, error } = await supabase.rpc('submit_quiz', { p_quiz_id: quizId, p_answers: answers });
  if (error) throw error;
  return data as QuizResult;
}

/** Only quizzes with at least one question count. */
export function hasQuiz(status: QuizStatus | undefined): status is QuizStatus {
  return !!status && status.question_count > 0;
}

/**
 * Modules a student can't open yet: with gating on, everything after the first
 * module whose quiz isn't passed. Returns module ids.
 */
export function lockedModuleIds(
  modules: ModuleWithLessons[],
  statuses: Map<string, QuizStatus>,
  gating: boolean
): Set<string> {
  const locked = new Set<string>();
  if (!gating) return locked;
  let blocked = false;
  for (const m of modules) {
    if (blocked) locked.add(m.id);
    const s = statuses.get(m.id);
    if (hasQuiz(s) && !s.passed) blocked = true;
  }
  return locked;
}

// ---------------------------------------------------------------------------
// Creator
// ---------------------------------------------------------------------------

export async function fetchCreatorQuiz(moduleId: string): Promise<CreatorQuiz | null> {
  const { data, error } = await supabase.rpc('creator_quiz', { p_module_id: moduleId });
  if (error) throw error;
  return (data as CreatorQuiz | null) ?? null;
}

/** Returns the module's quiz id, creating the quiz on first use. */
export async function ensureQuiz(moduleId: string): Promise<string> {
  const { data: existing, error: findErr } = await supabase
    .from('quizzes')
    .select('id')
    .eq('module_id', moduleId)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) return existing.id as string;

  const { data, error } = await supabase.from('quizzes').insert({ module_id: moduleId }).select('id').single();
  if (error) throw error;
  return data.id as string;
}

export async function updatePassPercent(quizId: string, passPercent: number): Promise<void> {
  const { error } = await supabase.from('quizzes').update({ pass_percent: passPercent }).eq('id', quizId);
  if (error) throw error;
}

export interface QuestionInput {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
}

export async function addQuestion(quizId: string, position: number, input: QuestionInput): Promise<string> {
  const { data, error } = await supabase
    .from('quiz_questions')
    .insert({ quiz_id: quizId, position, ...input })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateQuestion(questionId: string, input: QuestionInput): Promise<void> {
  const { error } = await supabase.from('quiz_questions').update(input).eq('id', questionId);
  if (error) throw error;
}

export async function deleteQuestion(questionId: string): Promise<void> {
  const { error } = await supabase.from('quiz_questions').delete().eq('id', questionId);
  if (error) throw error;
}
