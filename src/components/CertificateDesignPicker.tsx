import { useEffect, useRef, useState } from 'react';
import { Award, Check } from 'lucide-react';
import { Card } from '@/components/Card';
import { useI18n, type TKey } from '@/lib/i18n';
import {
  CERTIFICATE_DESIGNS, CERT_W, CERT_H, drawCertificate, loadCertificateAssets,
  type CertificateData, type CertificateDesign,
} from '@/lib/certificateRender';
import { buildCertificateVerifyLink } from '@/lib/deepLink';
import type { Lang } from '@/lib/i18n';

const NAMES: Record<CertificateDesign, TKey> = {
  classic: 'certDesign.classic',
  royal: 'certDesign.royal',
  modern: 'certDesign.modern',
  minimal: 'certDesign.minimal',
};

/** A certificate drawn at `pixelWidth`, shown at the width of its box. */
function CertificateCanvas({
  data,
  design,
  lang,
  pixelWidth,
  className = '',
}: {
  data: CertificateData;
  design: CertificateDesign;
  lang: Lang;
  pixelWidth: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadCertificateAssets().then(({ logo }) => {
      const canvas = ref.current;
      const ctx = canvas?.getContext('2d');
      if (cancelled || !canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawCertificate(ctx, data, design, lang, logo, pixelWidth);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [data, design, lang, pixelWidth]);

  return (
    <canvas
      ref={ref}
      width={pixelWidth}
      height={Math.round((pixelWidth * CERT_H) / CERT_W)}
      aria-hidden="true"
      className={`block w-full h-auto rounded-lg bg-slate-100 transition-opacity ${ready ? 'opacity-100' : 'opacity-0'} ${className}`}
    />
  );
}

/** Course setting: which certificate template the course's students get. */
export function CertificateDesignPicker({
  value,
  courseTitle,
  creatorName,
  lessonCount,
  onChange,
}: {
  value: CertificateDesign;
  courseTitle: string;
  creatorName: string;
  lessonCount: number;
  onChange: (design: CertificateDesign) => void;
}) {
  const { t, lang } = useI18n();
  const [sample, setSample] = useState<CertificateData | null>(null);

  // Same object between renders, so the canvases only redraw when it changes.
  useEffect(() => {
    setSample({
      studentName: t('certDesign.sampleName'),
      courseTitle,
      creatorName,
      lessonCount: Math.max(lessonCount, 1),
      issuedAt: new Date().toISOString(),
      code: 'ABCDE-12345',
      verifyUrl: buildCertificateVerifyLink('ABCDE12345'),
    });
  }, [t, courseTitle, creatorName, lessonCount]);

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
          <Award className="h-5 w-5 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">{t('certDesign.title')}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t('certDesign.hint')}</p>
        </div>
      </div>

      {sample && (
        <>
          <div className="mt-4 rounded-xl shadow-sm ring-1 ring-slate-200/70 overflow-hidden">
            <CertificateCanvas data={sample} design={value} lang={lang} pixelWidth={1000} className="rounded-none" />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('certDesign.title')}>
            {CERTIFICATE_DESIGNS.map((design) => {
              const active = design === value;
              return (
                <button
                  key={design}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => !active && onChange(design)}
                  className={`relative rounded-xl p-1.5 text-start transition-colors ${
                    active ? 'bg-blue-50 ring-2 ring-blue-500' : 'ring-1 ring-slate-200 active:bg-slate-50'
                  }`}
                >
                  <CertificateCanvas data={sample} design={design} lang={lang} pixelWidth={440} />
                  <span className="mt-1.5 mb-0.5 flex items-center justify-between gap-1 px-1">
                    <span className={`text-xs font-semibold ${active ? 'text-blue-700' : 'text-slate-700'}`}>{t(NAMES[design])}</span>
                    {active && (
                      <span className="h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center">
                        <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
