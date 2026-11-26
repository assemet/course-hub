interface AppHeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

import { ChevronLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export function AppHeader({ title, onBack, rightAction }: AppHeaderProps) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200/60">
      <div className="flex items-center gap-3 px-4 h-14">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center h-9 w-9 -ms-2 rounded-xl hover:bg-slate-100 active:scale-90 transition-all"
            aria-label={t('common.back')}
          >
            <ChevronLeft className="h-6 w-6 text-slate-700 rtl:rotate-180" />
          </button>
        )}
        <h1 dir="auto" className="text-lg font-bold text-slate-900 truncate flex-1 text-left rtl:text-right">{title}</h1>
        {rightAction && <div className="flex-shrink-0">{rightAction}</div>}
      </div>
    </header>
  );
}
