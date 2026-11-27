import { useState, type ReactNode } from 'react';

/**
 * A course's cover: the creator's image when there is one, otherwise a cover
 * generated from the course (brand colors and shapes picked from its id, plus
 * its initials), so every course looks distinct without any upload.
 */

interface Theme {
  bg: string;
  shape: string;
  text: string;
}

// Brand colors from the logo: blue/navy, violet, gold, sky.
const THEMES: Theme[] = [
  { bg: 'linear-gradient(135deg, #1565E0, #0B2463)', shape: '#F5A50A', text: '#FFFFFF' },
  { bg: 'linear-gradient(135deg, #8B5CF6, #5B21B6)', shape: 'rgba(255,255,255,0.22)', text: '#FFFFFF' },
  { bg: 'linear-gradient(135deg, #F9BC33, #D98A00)', shape: 'rgba(11,36,99,0.16)', text: '#0B2463' },
  { bg: 'linear-gradient(135deg, #2BB5F5, #1565E0)', shape: 'rgba(255,255,255,0.28)', text: '#FFFFFF' },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** "Python Basics" -> "Py", "أساسيات بايثون" -> "أ" (Arabic letters join, so one). */
function courseInitials(title: string): string {
  const word = title.trim().split(/\s+/)[0] ?? '';
  const chars = Array.from(word);
  if (chars.length === 0) return '';
  if (/^[A-Za-z]/.test(chars[0])) {
    return (chars[0].toUpperCase() + (chars[1] ?? '').toLowerCase()).trim();
  }
  return chars[0];
}

interface CourseCoverProps {
  course: { id: string; title: string; cover_url: string | null };
  className?: string;
  /** Size of the initials, as a Tailwind text class. */
  initialsClassName?: string;
  /** Shows the generated art without the initials (e.g. when the title is drawn on top). */
  hideInitials?: boolean;
  /** Draws the course title on the cover (course page header). */
  heroTitle?: boolean;
  children?: ReactNode;
}

export function CourseCover({ course, className = '', initialsClassName = 'text-2xl', hideInitials, heroTitle, children }: CourseCoverProps) {
  const [broken, setBroken] = useState(false);
  const showImage = !!course.cover_url && !broken;
  const h = hash(course.id);
  const theme = THEMES[h % THEMES.length];
  const variant = (h >> 3) % 3;

  return (
    <div className={`relative overflow-hidden ${className}`} style={showImage ? undefined : { background: theme.bg }}>
      {showImage ? (
        <img
          src={course.cover_url!}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <>
          {/* Decorative shapes, positioned in % so they scale with the cover. */}
          {variant === 0 && (
            <div
              aria-hidden="true"
              className="absolute rounded-full"
              style={{ width: '70%', aspectRatio: '1', background: theme.shape, bottom: '-38%', left: '-14%' }}
            />
          )}
          {variant === 1 && (
            <div
              aria-hidden="true"
              className="absolute rounded-full"
              style={{ width: '85%', aspectRatio: '1', border: '14px solid', borderColor: theme.shape, top: '-40%', left: '-25%' }}
            />
          )}
          {variant === 2 && (
            <>
              <div
                aria-hidden="true"
                className="absolute rounded-full"
                style={{ width: '45%', aspectRatio: '1', background: theme.shape, bottom: '-18%', left: '-8%' }}
              />
              <div
                aria-hidden="true"
                className="absolute rounded-[22%]"
                style={{ width: '28%', aspectRatio: '1', border: '3px solid rgba(255,255,255,0.45)', top: '14%', left: '22%', transform: 'rotate(14deg)' }}
              />
            </>
          )}
          {!hideInitials && !heroTitle && (
            <span
              aria-hidden="true"
              className={`absolute bottom-[8%] end-[10%] font-bold leading-none ${initialsClassName}`}
              style={{ color: theme.text }}
            >
              {courseInitials(course.title)}
            </span>
          )}
        </>
      )}
      {heroTitle && (
        <>
          {/* A photo needs a shade behind the title; generated art is already plain. */}
          {showImage && <div className="absolute inset-0 bg-gradient-to-t from-[#06163F]/80 via-[#06163F]/20 to-transparent" />}
          <h1
            dir="auto"
            className="absolute bottom-4 inset-x-5 text-[26px] font-bold leading-tight text-start line-clamp-2"
            style={{ color: showImage ? '#FFFFFF' : theme.text }}
          >
            {course.title}
          </h1>
        </>
      )}
      {children}
    </div>
  );
}
