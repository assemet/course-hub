import type { ReactNode } from 'react';
import { AlertCircle, Inbox } from 'lucide-react';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
      <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
        <AlertCircle className="h-6 w-6 text-red-500" />
      </div>
      <p className="text-sm text-slate-600 max-w-xs">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-1 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 active:scale-95 transition-all"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
      <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center">
        {icon ?? <Inbox className="h-7 w-7 text-slate-400" />}
      </div>
      <p className="text-base font-semibold text-slate-700">{title}</p>
      {description && <p className="text-sm text-slate-500 max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
