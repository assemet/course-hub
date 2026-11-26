import { Fragment } from 'react';
import { openExternalLink, openTelegramLink } from '@/lib/telegram';

// http(s) links, plus bare t.me / telegram.me links as creators often paste them.
// No lookbehind: it is a syntax error on iOS < 16.4 and would break the whole app.
const LINK_RE = /(https?:\/\/[^\s<>"]+|\b(?:t\.me|telegram\.me)\/[^\s<>"]+)/gi;
// Punctuation that usually ends the sentence rather than the URL (Latin and Arabic).
const TRAILING = /[.,;:!?'")\]}»،؛؟…]+$/;

type Part = { text: string } | { text: string; href: string };

function splitLinks(text: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const start = match.index ?? 0;
    const raw = match[0];
    const url = raw.replace(TRAILING, '');
    if (!url) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: url, href: /^https?:\/\//i.test(url) ? url : `https://${url}` });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

function isTelegramHost(href: string): boolean {
  try {
    const host = new URL(href).hostname;
    return host === 't.me' || host === 'telegram.me' || host.endsWith('.t.me');
  } catch {
    return false;
  }
}

/**
 * Renders plain text with its links clickable. Telegram links open inside
 * Telegram; everything else opens in the browser (never inside the Mini App).
 */
export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {splitLinks(text).map((part, i) =>
        'href' in part ? (
          <a
            key={i}
            href={part.href}
            dir="ltr"
            onClick={(e) => {
              e.preventDefault();
              if (isTelegramHost(part.href)) openTelegramLink(part.href);
              else openExternalLink(part.href);
            }}
            className="text-blue-600 underline underline-offset-2 [overflow-wrap:anywhere]"
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        )
      )}
    </>
  );
}
