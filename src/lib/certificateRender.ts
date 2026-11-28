import qrcode from 'qrcode-generator';
import type { Lang } from './i18n';

/**
 * Certificate images, drawn on a canvas in the Mini App (browsers shape Arabic
 * text well). All designs share the same 2000x1414 page (A4 landscape) and the
 * same content; the course's `certificate_design` picks one.
 */

export const CERTIFICATE_DESIGNS = ['classic', 'royal', 'modern', 'minimal'] as const;
export type CertificateDesign = (typeof CERTIFICATE_DESIGNS)[number];

export function toCertificateDesign(value: unknown): CertificateDesign {
  return CERTIFICATE_DESIGNS.includes(value as CertificateDesign) ? (value as CertificateDesign) : 'classic';
}

export interface CertificateData {
  studentName: string;
  courseTitle: string;
  creatorName: string;
  lessonCount: number;
  issuedAt: string;
  /** Formatted verification code, e.g. ABCDE-12345. */
  code: string;
  /** Link encoded in the QR code (opens the verification screen). */
  verifyUrl: string;
}

export const CERT_W = 2000;
export const CERT_H = 1414;
const W = CERT_W;
const H = CERT_H;

const SANS = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif';
const SERIF = '"Certificate Amiri", "Amiri", "Noto Naskh Arabic", "Times New Roman", serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const NAVY = '#0B2463';
const BLUE = '#1565E0';
const GOLD = '#F5A50A';
const VIOLET = '#7C3AED';

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

interface Strings {
  title: string;
  eyebrow: string;
  presented: string;
  forCourse: string;
  teacher: string;
  date: string;
  lessonsLabel: string;
  lessons: (n: number) => string;
  code: string;
  scan: string;
}

const TEXT: Record<Lang, Strings> = {
  ar: {
    title: 'شهادة إتمام',
    eyebrow: 'وثيقة إنجاز',
    presented: 'تُمنح هذه الشهادة إلى',
    forCourse: 'تقديراً لإتمام جميع متطلبات دورة',
    teacher: 'المدرّس',
    date: 'تاريخ الإصدار',
    lessonsLabel: 'الدروس المكتملة',
    lessons: (n) => (n === 1 ? 'درس واحد' : n === 2 ? 'درسان' : n >= 3 && n <= 10 ? `${n} دروس` : `${n} درساً`),
    code: 'رمز التحقق',
    scan: 'امسح للتحقق',
  },
  en: {
    title: 'Certificate of Completion',
    eyebrow: 'OFFICIAL RECORD',
    presented: 'This certificate is proudly presented to',
    forCourse: 'for successfully completing the course',
    teacher: 'Instructor',
    date: 'Date of issue',
    lessonsLabel: 'Lessons completed',
    lessons: (n) => (n === 1 ? '1 lesson' : `${n} lessons`),
    code: 'Verification code',
    scan: 'Scan to verify',
  },
};

function formatDate(iso: string, lang: Lang): string {
  return new Date(iso).toLocaleDateString(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Assets: the serif font is only needed here, so it loads on first use.
// ---------------------------------------------------------------------------

const ARABIC_RANGE = 'U+0600-06FF, U+0750-077F, U+0870-08FF, U+200C-200E, U+2010-2011, U+FB50-FDFF, U+FE70-FEFC';
const LATIN_RANGE = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122';

interface Assets {
  logo: HTMLImageElement | null;
}
let assets: Promise<Assets> | null = null;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function loadFonts(): Promise<void> {
  const base = import.meta.env.BASE_URL ?? '/';
  if (typeof FontFace !== 'undefined') {
    const faces = (['400', '700'] as const).flatMap((weight) => [
      new FontFace('Certificate Amiri', `url(${base}fonts/amiri-arabic-${weight}.woff2) format('woff2')`, { weight, unicodeRange: ARABIC_RANGE }),
      new FontFace('Certificate Amiri', `url(${base}fonts/amiri-latin-${weight}.woff2) format('woff2')`, { weight, unicodeRange: LATIN_RANGE }),
    ]);
    await Promise.all(
      faces.map((face) =>
        face.load().then(
          (loaded) => document.fonts.add(loaded),
          () => undefined // falls back to the next font in SERIF
        )
      )
    );
  }
  // The UI font may not have loaded every weight/subset yet.
  await Promise.all(
    ['400', '600', '700'].map((w) => document.fonts?.load(`${w} 40px "IBM Plex Sans Arabic"`, 'أبجد Abc').catch(() => []))
  );
}

/** Fonts and logo; cached for the session. Call before drawing. */
export function loadCertificateAssets(): Promise<Assets> {
  assets ??= (async () => {
    const [logo] = await Promise.all([loadImage(`${import.meta.env.BASE_URL ?? '/'}logo.webp`), loadFonts().catch(() => undefined)]);
    return { logo };
  })();
  return assets;
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

type Ctx = CanvasRenderingContext2D;

function font(ctx: Ctx, weight: number, size: number, family: string) {
  ctx.font = `${weight} ${size}px ${family}`;
}

/** Letter spacing where the browser supports it (purely decorative). */
function spacing(ctx: Ctx, px: number) {
  if ('letterSpacing' in ctx) (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** Largest size (<= start, >= min) at which `text` fits on one line. */
function fit(ctx: Ctx, text: string, weight: number, family: string, start: number, min: number, maxWidth: number): number {
  let size = start;
  for (; size > min; size -= 4) {
    font(ctx, weight, size, family);
    if (ctx.measureText(text).width <= maxWidth) return size;
  }
  font(ctx, weight, min, family);
  return min;
}

/** Splits text into at most `maxLines` lines that fit `maxWidth`. */
function wrap(ctx: Ctx, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

/** Draws the course title (1-2 lines), the first line at `y`; returns the bottom of the block. */
function courseTitle(ctx: Ctx, text: string, x: number, y: number, maxWidth: number, size: number, lineHeight: number): number {
  font(ctx, 700, size, SANS);
  let lines = wrap(ctx, text, maxWidth, 2);
  if (lines.length > 1) {
    font(ctx, 700, size - 8, SANS);
    lines = wrap(ctx, text, maxWidth, 2);
  }
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight, maxWidth));
  return y + (lines.length - 1) * lineHeight + lineHeight / 2;
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function goldGradient(ctx: Ctx, x0: number, x1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, '#B9821C');
  g.addColorStop(0.5, '#F7D27C');
  g.addColorStop(1, '#B9821C');
  return g;
}

function drawQR(ctx: Ctx, text: string, x: number, y: number, size: number, dark: string, light: string) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const pad = Math.round(size * 0.07);
  const cell = (size - pad * 2) / n;
  ctx.fillStyle = light;
  roundRect(ctx, x, y, size, size, size * 0.08);
  ctx.fill();
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      const x0 = Math.round(x + pad + c * cell);
      const y0 = Math.round(y + pad + r * cell);
      ctx.fillRect(x0, y0, Math.round(x + pad + (c + 1) * cell) - x0, Math.round(y + pad + (r + 1) * cell) - y0);
    }
  }
}

/** Gold rosette with ribbons and the logo in the middle. */
function drawSeal(ctx: Ctx, x: number, y: number, r: number, logo: HTMLImageElement | null, ribbon: string, inner: string) {
  // Ribbons
  ctx.fillStyle = ribbon;
  for (const side of [-1, 1]) {
    const bx = x + side * r * 0.42;
    ctx.beginPath();
    ctx.moveTo(bx - r * 0.22, y + r * 0.4);
    ctx.lineTo(bx + r * 0.22, y + r * 0.4);
    ctx.lineTo(bx + side * r * 0.12 + r * 0.22, y + r * 1.55);
    ctx.lineTo(bx + side * r * 0.12, y + r * 1.35);
    ctx.lineTo(bx + side * r * 0.12 - r * 0.22, y + r * 1.55);
    ctx.closePath();
    ctx.fill();
  }
  // Serrated edge
  const points = 36;
  ctx.beginPath();
  for (let i = 0; i <= points * 2; i++) {
    const a = (Math.PI * i) / points;
    const rr = i % 2 === 0 ? r : r * 0.92;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#FCE3A1');
  g.addColorStop(0.6, '#F0B53A');
  g.addColorStop(1, '#C98A12');
  ctx.fillStyle = g;
  ctx.fill();
  // Rings
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = r * 0.035;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
  ctx.fill();
  if (logo) {
    const s = r * 1.12;
    ctx.drawImage(logo, x - s / 2, y - s / 2, s, s);
  }
}

/** Value above a line with a small label below (signature / date). */
function signatureBlock(
  ctx: Ctx,
  x: number,
  y: number,
  value: string,
  label: string,
  opts: { valueFont: string; valueSize: number; valueColor: string; lineColor: string; labelColor: string; width?: number; align?: CanvasTextAlign }
) {
  const width = opts.width ?? 420;
  const align = opts.align ?? 'center';
  const left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
  ctx.textAlign = align;
  ctx.fillStyle = opts.valueColor;
  fit(ctx, value, 700, opts.valueFont, opts.valueSize, 28, width);
  ctx.fillText(value, x, y - 34, width);
  ctx.fillStyle = opts.lineColor;
  ctx.fillRect(left, y, width, 3);
  ctx.fillStyle = opts.labelColor;
  font(ctx, 400, 30, SANS);
  ctx.fillText(label, x, y + 44, width);
}

/** Thin line – diamond – thin line. */
function divider(ctx: Ctx, cx: number, y: number, half: number, color: string | CanvasGradient) {
  ctx.fillStyle = color;
  ctx.fillRect(cx - half, y - 1.5, half - 26, 3);
  ctx.fillRect(cx + 26, y - 1.5, half - 26, 3);
  ctx.beginPath();
  ctx.moveTo(cx, y - 14);
  ctx.lineTo(cx + 14, y);
  ctx.lineTo(cx, y + 14);
  ctx.lineTo(cx - 14, y);
  ctx.closePath();
  ctx.fill();
}

/** Eight-pointed star (two overlapping squares), as in Islamic geometric art. */
function star8(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * i) / 8 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.76;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Designs
// ---------------------------------------------------------------------------

interface DrawArgs {
  ctx: Ctx;
  d: CertificateData;
  tr: Strings;
  lang: Lang;
  rtl: boolean;
  logo: HTMLImageElement | null;
}

/** Cream paper, navy and gold frame, serif headings. */
function drawClassic({ ctx, d, tr, lang, rtl, logo }: DrawArgs) {
  const cx = W / 2;
  ctx.fillStyle = '#FBF7EE';
  ctx.fillRect(0, 0, W, H);
  const v = ctx.createRadialGradient(cx, H / 2, 300, cx, H / 2, 1250);
  v.addColorStop(0, 'rgba(255,255,255,0.6)');
  v.addColorStop(1, 'rgba(201,160,90,0.16)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  if (logo) {
    ctx.globalAlpha = 0.035;
    ctx.drawImage(logo, cx - 320, H / 2 - 280, 640, 640);
    ctx.globalAlpha = 1;
  }

  // Frames
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 16;
  ctx.strokeRect(44, 44, W - 88, H - 88);
  ctx.strokeStyle = '#C9932B';
  ctx.lineWidth = 3;
  ctx.strokeRect(78, 78, W - 156, H - 156);
  ctx.strokeStyle = NAVY;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(90, 90, W - 180, H - 180);
  // Corner ornaments
  ctx.fillStyle = '#C9932B';
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x0 = sx > 0 ? 104 : W - 104;
    const y0 = sy > 0 ? 104 : H - 104;
    ctx.fillRect(Math.min(x0, x0 + sx * 130), y0 - 2.5, 130, 5);
    ctx.fillRect(x0 - 2.5, Math.min(y0, y0 + sy * 130), 5, 130);
    star8(ctx, x0 + sx * 26, y0 + sy * 26, 16);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  if (logo) ctx.drawImage(logo, cx - 62, 118, 124, 124);

  ctx.fillStyle = NAVY;
  fit(ctx, tr.title, 700, SERIF, lang === 'ar' ? 132 : 104, 60, W - 700);
  ctx.fillText(tr.title, cx, 330);
  divider(ctx, cx, 420, 230, '#C9932B');

  ctx.fillStyle = '#5B6478';
  font(ctx, 400, 42, SANS);
  ctx.fillText(tr.presented, cx, 480);

  ctx.fillStyle = NAVY;
  const nameSize = fit(ctx, d.studentName, 700, SERIF, 140, 64, W - 620);
  ctx.fillText(d.studentName, cx, 632);
  const nameW = Math.min(ctx.measureText(d.studentName).width + 160, 1200);
  ctx.fillStyle = '#C9932B';
  ctx.fillRect(cx - nameW / 2, 632 + nameSize * 0.66, nameW, 3);

  ctx.fillStyle = '#5B6478';
  font(ctx, 400, 42, SANS);
  ctx.fillText(tr.forCourse, cx, 765);
  ctx.fillStyle = BLUE;
  const bottom = courseTitle(ctx, d.courseTitle, cx, 850, W - 640, 64, 78);
  ctx.fillStyle = '#8A7A5A';
  font(ctx, 500, 34, SANS);
  ctx.fillText(tr.lessons(d.lessonCount), cx, bottom + 34);

  // Signature, seal, date
  const startX = rtl ? W - 470 : 470;
  const endX = rtl ? 470 : W - 470;
  const common = { valueColor: NAVY, lineColor: '#C9932B', labelColor: '#6B7280' };
  signatureBlock(ctx, startX, 1180, d.creatorName, tr.teacher, { ...common, valueFont: SERIF, valueSize: 56 });
  signatureBlock(ctx, endX, 1180, formatDate(d.issuedAt, lang), tr.date, { ...common, valueFont: SANS, valueSize: 40 });
  drawSeal(ctx, cx, 1135, 92, logo, NAVY, '#FFFFFF');

  // Verification (top end corner)
  const qx = rtl ? 150 : W - 150 - 150;
  drawQR(ctx, d.verifyUrl, qx, 140, 150, NAVY, '#FFFFFF');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#6B7280';
  font(ctx, 400, 24, SANS);
  ctx.fillText(tr.code, qx + 75, 322);
  ctx.fillStyle = NAVY;
  font(ctx, 700, 28, MONO);
  ctx.fillText(d.code, qx + 75, 358);
}

/** Navy with gold, Islamic star pattern. */
function drawRoyal({ ctx, d, tr, lang, rtl, logo }: DrawArgs) {
  const cx = W / 2;
  const bg = ctx.createRadialGradient(cx, H / 2 - 100, 100, cx, H / 2, 1300);
  bg.addColorStop(0, '#173A8C');
  bg.addColorStop(1, '#06143A');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Faint star lattice
  ctx.strokeStyle = 'rgba(245,197,90,0.07)';
  ctx.lineWidth = 2;
  for (let y = 0; y <= H + 140; y += 140) {
    for (let x = (y / 140) % 2 ? 70 : 0; x <= W + 140; x += 140) {
      star8(ctx, x, y, 44);
      ctx.stroke();
    }
  }
  const fade = ctx.createRadialGradient(cx, H / 2, 200, cx, H / 2, 900);
  fade.addColorStop(0, 'rgba(10,31,84,0.92)');
  fade.addColorStop(1, 'rgba(10,31,84,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);

  const gold = goldGradient(ctx, 0, W);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 8;
  ctx.strokeRect(52, 52, W - 104, H - 104);
  ctx.lineWidth = 2;
  ctx.strokeRect(74, 74, W - 148, H - 148);
  for (const [x, y] of [[74, 74], [W - 74, 74], [74, H - 74], [W - 74, H - 74]]) {
    ctx.fillStyle = '#0A1F54';
    star8(ctx, x, y, 46);
    ctx.fill();
    ctx.strokeStyle = gold;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = gold;
    star8(ctx, x, y, 18);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  if (logo) ctx.drawImage(logo, cx - 64, 120, 128, 128);

  ctx.fillStyle = goldGradient(ctx, cx - 450, cx + 450);
  fit(ctx, tr.title, 700, SERIF, lang === 'ar' ? 132 : 104, 60, W - 700);
  ctx.fillText(tr.title, cx, 340);
  divider(ctx, cx, 430, 240, goldGradient(ctx, cx - 240, cx + 240));

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  font(ctx, 400, 42, SANS);
  ctx.fillText(tr.presented, cx, 485);

  ctx.fillStyle = '#FFFFFF';
  fit(ctx, d.studentName, 700, SERIF, 144, 64, W - 620);
  ctx.fillText(d.studentName, cx, 635);

  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  font(ctx, 400, 42, SANS);
  ctx.fillText(tr.forCourse, cx, 765);
  ctx.fillStyle = goldGradient(ctx, cx - 600, cx + 600);
  const bottom = courseTitle(ctx, d.courseTitle, cx, 850, W - 640, 64, 78);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  font(ctx, 400, 34, SANS);
  ctx.fillText(tr.lessons(d.lessonCount), cx, bottom + 34);

  const startX = rtl ? W - 470 : 470;
  const endX = rtl ? 470 : W - 470;
  const common = { valueColor: '#FFFFFF', lineColor: '#D9A641', labelColor: 'rgba(255,255,255,0.6)' };
  signatureBlock(ctx, startX, 1180, d.creatorName, tr.teacher, { ...common, valueFont: SERIF, valueSize: 56 });
  signatureBlock(ctx, endX, 1180, formatDate(d.issuedAt, lang), tr.date, { ...common, valueFont: SANS, valueSize: 40 });
  drawSeal(ctx, cx, 1135, 92, logo, '#B9821C', '#0A1F54');

  const qx = rtl ? 160 : W - 160 - 150;
  drawQR(ctx, d.verifyUrl, qx, 150, 150, NAVY, '#FBF7EE');
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  font(ctx, 400, 24, SANS);
  ctx.fillText(tr.code, qx + 75, 332);
  ctx.fillStyle = '#F7D27C';
  font(ctx, 700, 28, MONO);
  ctx.fillText(d.code, qx + 75, 368);
}

/** Side band with logo, seal and QR; content aligned to the start. */
function drawModern({ ctx, d, tr, lang, rtl, logo }: DrawArgs) {
  const BAND = 560;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Band on the start side (right in Arabic)
  const bx0 = rtl ? W - BAND : 0;
  const bcx = bx0 + BAND / 2;
  const band = ctx.createLinearGradient(0, 0, 0, H);
  band.addColorStop(0, BLUE);
  band.addColorStop(1, NAVY);
  ctx.fillStyle = band;
  ctx.fillRect(bx0, 0, BAND, H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(bx0, 0, BAND, H);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.arc(bx0 + BAND * 0.85, 120, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(bx0 + BAND * 0.1, H - 80, 300, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = GOLD;
  ctx.fillRect(rtl ? bx0 - 14 : BAND, 0, 14, H);

  ctx.textAlign = 'center';
  if (logo) ctx.drawImage(logo, bcx - 90, 130, 180, 180);
  ctx.fillStyle = '#FFFFFF';
  font(ctx, 700, 46, SANS);
  ctx.fillText('Course Hub', bcx, 370);
  drawSeal(ctx, bcx, 640, 118, logo, GOLD, '#FFFFFF');
  drawQR(ctx, d.verifyUrl, bcx - 105, 950, 210, NAVY, '#FFFFFF');
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  font(ctx, 400, 28, SANS);
  ctx.fillText(tr.code, bcx, 1212);
  ctx.fillStyle = '#FFFFFF';
  font(ctx, 700, 36, MONO);
  ctx.fillText(d.code, bcx, 1258);

  // Content
  const cs = rtl ? W - BAND - 130 : BAND + 130; // start edge of the text
  const maxW = W - BAND - 260;
  const along = (dx: number) => (rtl ? cs - dx : cs + dx);
  ctx.textAlign = 'start';

  ctx.fillStyle = BLUE;
  font(ctx, 700, 32, SANS);
  spacing(ctx, lang === 'ar' ? 0 : 8);
  ctx.fillText(tr.eyebrow, cs, 230);
  spacing(ctx, 0);
  ctx.fillStyle = NAVY;
  fit(ctx, tr.title, 700, SANS, lang === 'ar' ? 112 : 92, 56, maxW);
  ctx.fillText(tr.title, cs, 335);
  ctx.fillStyle = GOLD;
  ctx.fillRect(rtl ? cs - 150 : cs, 410, 150, 10);

  ctx.fillStyle = '#64748B';
  font(ctx, 400, 40, SANS);
  ctx.fillText(tr.presented, cs, 500);
  ctx.fillStyle = NAVY;
  fit(ctx, d.studentName, 700, SERIF, 132, 60, maxW);
  ctx.fillText(d.studentName, cs, 628);

  ctx.fillStyle = '#64748B';
  font(ctx, 400, 40, SANS);
  ctx.fillText(tr.forCourse, cs, 755);
  ctx.fillStyle = BLUE;
  const bottom = courseTitle(ctx, d.courseTitle, cs, 840, maxW, 64, 78);
  ctx.fillStyle = '#94A3B8';
  font(ctx, 500, 32, SANS);
  ctx.fillText(tr.lessons(d.lessonCount), cs, bottom + 30);

  const common = { valueColor: NAVY, lineColor: '#CBD5E1', labelColor: '#64748B', width: 440, align: (rtl ? 'right' : 'left') as CanvasTextAlign };
  signatureBlock(ctx, cs, 1200, d.creatorName, tr.teacher, { ...common, valueFont: SERIF, valueSize: 54 });
  signatureBlock(ctx, along(560), 1200, formatDate(d.issuedAt, lang), tr.date, { ...common, valueFont: SANS, valueSize: 40 });
}

/** White page, a brand-colour bar, large type. */
function drawMinimal({ ctx, d, tr, lang, rtl, logo }: DrawArgs) {
  const M = 170;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(rtl ? 1 : 0, BLUE);
  bar.addColorStop(0.55, VIOLET);
  bar.addColorStop(rtl ? 0 : 1, GOLD);
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, W, 24);
  ctx.fillRect(0, H - 10, W, 10);

  const cs = rtl ? W - M : M;
  const along = (dx: number) => (rtl ? cs - dx : cs + dx);
  const maxW = W - M * 2;
  ctx.textAlign = 'start';

  if (logo) ctx.drawImage(logo, rtl ? cs - 96 : cs, 120, 96, 96);
  ctx.fillStyle = NAVY;
  font(ctx, 700, 40, SANS);
  ctx.fillText('Course Hub', along(124), 170);

  ctx.fillStyle = '#94A3B8';
  font(ctx, 600, 46, SANS);
  spacing(ctx, lang === 'ar' ? 0 : 6);
  ctx.fillText(lang === 'ar' ? tr.title : tr.title.toUpperCase(), cs, 370);
  spacing(ctx, 0);

  ctx.fillStyle = NAVY;
  fit(ctx, d.studentName, 700, SANS, 156, 64, maxW);
  ctx.fillText(d.studentName, cs, 510);

  ctx.fillStyle = '#64748B';
  font(ctx, 400, 42, SANS);
  ctx.fillText(tr.forCourse, cs, 660);
  ctx.fillStyle = BLUE;
  courseTitle(ctx, d.courseTitle, cs, 755, maxW - 120, 72, 88);

  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(M, 1010, W - M * 2, 3);

  const info: Array<[string, string]> = [
    [tr.teacher, d.creatorName],
    [tr.date, formatDate(d.issuedAt, lang)],
    [tr.lessonsLabel, String(d.lessonCount)],
  ];
  info.forEach(([label, value], i) => {
    const x = along(i * 450);
    ctx.fillStyle = '#94A3B8';
    font(ctx, 400, 30, SANS);
    ctx.fillText(label, x, 1100, 420);
    ctx.fillStyle = NAVY;
    fit(ctx, value, 600, SANS, 42, 28, 420);
    ctx.fillText(value, x, 1165, 420);
  });

  const qs = 190;
  const qx = rtl ? M : W - M - qs;
  drawQR(ctx, d.verifyUrl, qx, 1050, qs, NAVY, '#F1F5F9');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748B';
  font(ctx, 700, 26, MONO);
  ctx.fillText(d.code, qx + qs / 2, 1280);
  // The QR sits on the end side; keep the info row clear of it.
}

const DRAW: Record<CertificateDesign, (args: DrawArgs) => void> = {
  classic: drawClassic,
  royal: drawRoyal,
  modern: drawModern,
  minimal: drawMinimal,
};

/**
 * Draws a certificate onto `ctx`, scaled so the page fills `width` pixels.
 * Load assets first with loadCertificateAssets().
 */
export function drawCertificate(
  ctx: CanvasRenderingContext2D,
  data: CertificateData,
  design: CertificateDesign,
  lang: Lang,
  logo: HTMLImageElement | null,
  width = W
) {
  const rtl = lang === 'ar';
  ctx.save();
  ctx.scale(width / W, width / W);
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textBaseline = 'middle';
  ctx.lineCap = 'butt';
  DRAW[design]({ ctx, d: data, tr: TEXT[lang], lang, rtl, logo });
  ctx.restore();
}

/** Full-size image (JPEG) of a certificate. */
export async function renderCertificateImage(data: CertificateData, design: CertificateDesign, lang: Lang): Promise<Blob> {
  const { logo } = await loadCertificateAssets();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported');
  drawCertificate(ctx, data, design, lang, logo);
  return new Promise((resolve, reject) =>
    // JPEG: the gradients make PNGs 2-3 MB; at this quality the text stays crisp.
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/jpeg', 0.92)
  );
}
