/**
 * Cover colors for courses without a cover image, picked from the course id
 * so a course always gets the same ones (cover, and the tiles of its lessons).
 */

export interface Theme {
  bg: string;
  shape: string;
  text: string;
}

// Brand colors from the logo: blue/navy, violet, gold, sky.
export const THEMES: Theme[] = [
  { bg: 'linear-gradient(135deg, #1565E0, #0B2463)', shape: '#F5A50A', text: '#FFFFFF' },
  { bg: 'linear-gradient(135deg, #8B5CF6, #5B21B6)', shape: 'rgba(255,255,255,0.22)', text: '#FFFFFF' },
  { bg: 'linear-gradient(135deg, #F9BC33, #D98A00)', shape: 'rgba(11,36,99,0.16)', text: '#0B2463' },
  { bg: 'linear-gradient(135deg, #2BB5F5, #1565E0)', shape: 'rgba(255,255,255,0.28)', text: '#FFFFFF' },
];

export function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The cover colors of a course; lesson tiles reuse them so they match its cover. */
export function courseTheme(courseId: string): Theme {
  return THEMES[hash(courseId) % THEMES.length];
}

