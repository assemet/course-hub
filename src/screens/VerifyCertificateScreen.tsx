import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { Card } from '@/components/Card';
import { AppHeader } from '@/components/AppHeader';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { useI18n } from '@/lib/i18n';
import { errorMessage } from '@/lib/errors';
import { verifyCertificate, formatCertificateCode, type VerifiedCertificate } from '@/lib/certificateService';

/** Opened from a certificate's verify link (startapp=cert_CODE). Reads the record from the database. */
export function VerifyCertificateScreen({ code, onBack }: { code: string; onBack: () => void }) {
  const { t, formatDate } = useI18n();
  const [cert, setCert] = useState<VerifiedCertificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setCert(await verifyCertificate(code));
    } catch (err) {
      setError(errorMessage(err, t('cert.verifyFailed')));
    } finally {
      setLoading(false);
    }
  }, [code, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return (
    <>
      <AppHeader title={t('cert.verifyTitle')} onBack={onBack} />
      <LoadingScreen />
    </>
  );
  if (error) return (
    <>
      <AppHeader title={t('cert.verifyTitle')} onBack={onBack} />
      <ErrorState message={error} onRetry={load} />
    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader title={t('cert.verifyTitle')} onBack={onBack} />
      <div className="px-4 py-8">
        {cert ? (
          <Card className="p-6 text-center border-green-300">
            <div className="mx-auto h-16 w-16 rounded-full bg-green-500 flex items-center justify-center">
              <ShieldCheck className="h-8 w-8 text-white" />
            </div>
            <h1 className="mt-4 text-lg font-bold text-green-700">{t('cert.valid')}</h1>
            <dl className="mt-5 space-y-3 text-start">
              {[
                [t('cert.field.student'), cert.student_name],
                [t('cert.field.course'), cert.course_title],
                [t('cert.field.teacher'), cert.creator_name],
                [t('cert.field.lessons'), String(cert.lesson_count)],
                [t('cert.field.date'), formatDate(cert.issued_at)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 border-b border-slate-100 pb-2">
                  <dt className="text-xs text-slate-500 flex-shrink-0">{label}</dt>
                  <dd dir="auto" className="text-sm font-semibold text-slate-900 text-end">{value}</dd>
                </div>
              ))}
            </dl>
            <p dir="ltr" className="mt-4 font-mono text-sm text-slate-500">{formatCertificateCode(cert.code)}</p>
          </Card>
        ) : (
          <Card className="p-6 text-center border-red-300">
            <div className="mx-auto h-16 w-16 rounded-full bg-red-500 flex items-center justify-center">
              <ShieldX className="h-8 w-8 text-white" />
            </div>
            <h1 className="mt-4 text-lg font-bold text-red-600">{t('cert.invalid')}</h1>
            <p className="mt-2 text-sm text-slate-500">{t('cert.invalidBody')}</p>
            <p dir="ltr" className="mt-3 font-mono text-sm text-slate-400">{code}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
