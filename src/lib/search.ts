/**
 * Normalizes text for forgiving search, especially in Arabic:
 * - removes diacritics (tashkeel) and tatweel
 * - أ إ آ ٱ -> ا,  ة -> ه,  ى -> ي,  ؤ ئ -> ء (so مسؤول matches مسئول)
 * - Arabic-Indic digits -> Latin digits
 * - lowercases and collapses whitespace
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every word of `query` appears somewhere in `fields`. */
export function matchesSearch(query: string, fields: Array<string | null | undefined>): boolean {
  const words = normalizeForSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeForSearch(fields.filter(Boolean).join(' '));
  return words.every((w) => haystack.includes(w));
}
