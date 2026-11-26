import { supabase } from './supabase';

export interface Flashcard {
  id: string;
  module_id: string;
  position: number;
  front: string;
  back: string;
}

/** The current student's Leitner state for one card (absent = never reviewed). */
export interface FlashcardReview {
  card_id: string;
  box: number;
  due_at: string;
  reviews: number;
  lapses: number;
}

export interface ModuleFlashcardStats {
  module_id: string;
  total: number;
  due: number;
  learned: number;
  next_due_at: string | null;
}

const CARD_COLUMNS = 'id, module_id, position, front, back';

// ---------------------------------------------------------------------------
// Student
// ---------------------------------------------------------------------------

export async function fetchFlashcardStats(courseId: string): Promise<Map<string, ModuleFlashcardStats>> {
  const { data, error } = await supabase.rpc('course_flashcard_stats', { p_course_id: courseId });
  if (error) throw error;
  return new Map(((data ?? []) as ModuleFlashcardStats[]).map((s) => [s.module_id, s]));
}

export async function fetchCards(moduleIds: string[]): Promise<Flashcard[]> {
  if (moduleIds.length === 0) return [];
  const { data, error } = await supabase
    .from('flashcards')
    .select(CARD_COLUMNS)
    .in('module_id', moduleIds)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Flashcard[];
}

export async function fetchMyReviews(cardIds: string[]): Promise<Map<string, FlashcardReview>> {
  if (cardIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('flashcard_reviews')
    .select('card_id, box, due_at, reviews, lapses')
    .in('card_id', cardIds);
  if (error) throw error;
  return new Map(((data ?? []) as FlashcardReview[]).map((r) => [r.card_id, r]));
}

/** Records an answer; the database moves the card between boxes. */
export async function reviewCard(cardId: string, known: boolean): Promise<FlashcardReview> {
  const { data, error } = await supabase.rpc('review_flashcard', { p_card_id: cardId, p_known: known });
  if (error) throw error;
  return data as FlashcardReview;
}

export const SESSION_SIZE = 20;

/**
 * Cards to study now: due reviews first (oldest due first), then new cards in
 * course order. `all` ignores the schedule (practice everything).
 */
export function buildSession(
  cards: Flashcard[],
  reviews: Map<string, FlashcardReview>,
  moduleOrder: string[],
  all = false
): Flashcard[] {
  const now = Date.now();
  const order = (c: Flashcard) => moduleOrder.indexOf(c.module_id) * 100000 + c.position;
  const due = cards
    .filter((c) => reviews.has(c.id) && (all || new Date(reviews.get(c.id)!.due_at).getTime() <= now))
    .sort((a, b) => new Date(reviews.get(a.id)!.due_at).getTime() - new Date(reviews.get(b.id)!.due_at).getTime());
  const fresh = cards.filter((c) => !reviews.has(c.id)).sort((a, b) => order(a) - order(b));
  return [...due, ...fresh].slice(0, all ? cards.length : SESSION_SIZE);
}

// ---------------------------------------------------------------------------
// Creator
// ---------------------------------------------------------------------------

export async function fetchModuleCards(moduleId: string): Promise<Flashcard[]> {
  return fetchCards([moduleId]);
}

export async function addCards(moduleId: string, startPosition: number, cards: Array<{ front: string; back: string }>): Promise<void> {
  if (cards.length === 0) return;
  const { error } = await supabase
    .from('flashcards')
    .insert(cards.map((c, i) => ({ module_id: moduleId, position: startPosition + i, front: c.front, back: c.back })));
  if (error) throw error;
}

export async function updateCard(cardId: string, front: string, back: string): Promise<void> {
  const { error } = await supabase.from('flashcards').update({ front, back }).eq('id', cardId);
  if (error) throw error;
}

export async function deleteCard(cardId: string): Promise<void> {
  const { error } = await supabase.from('flashcards').delete().eq('id', cardId);
  if (error) throw error;
}

/**
 * Parses pasted lines into cards. Each line is "front | back"; a tab, " = " or
 * " : " also work (copying two columns from a spreadsheet gives tabs).
 * Returns cards and the 1-based numbers of lines that couldn't be read.
 */
export function parseBulkCards(text: string): { cards: Array<{ front: string; back: string }>; badLines: number[] } {
  const cards: Array<{ front: string; back: string }> = [];
  const badLines: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const match =
      line.match(/^(.+?)\s*\|\s*(.+)$/) ??
      line.match(/^(.+?)\t+(.+)$/) ??
      line.match(/^(.+?)\s+=\s+(.+)$/) ??
      line.match(/^(.+?)\s+:\s+(.+)$/);
    const front = match?.[1].trim() ?? '';
    const back = match?.[2].trim() ?? '';
    if (front && back && front.length <= 500 && back.length <= 1000) cards.push({ front, back });
    else badLines.push(i + 1);
  });
  return { cards, badLines };
}
