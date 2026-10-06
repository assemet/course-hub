interface AppHeaderProps {
  title: string;
  onBack?: () => void;
  rightAction?: React.ReactNode;
}

import { ChevronLeft } from 'lucide-react';

export function AppHeader({ title, onBack, rightAction }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200/60">
      <div className="flex items-center gap-3 px-4 h-14">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center h-9 w-9 -ml-2 rounded-xl hover:bg-slate-100 active:scale-90 transition-all"
            aria-label="Go back"
          >
            <ChevronLeft className="h-6 w-6 text-slate-700" />
          </button>
        )}
        <h1 className="text-lg font-bold text-slate-900 truncate flex-1">{title}</h1>
        {rightAction && <div className="flex-shrink-0">{rightAction}</div>}
      </div>
    </header>
  );
}
