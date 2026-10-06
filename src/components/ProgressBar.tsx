interface ProgressBarProps {
  percent: number;
  className?: string;
}

export function ProgressBar({ percent, className = '' }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={`h-2 w-full rounded-full bg-slate-200 overflow-hidden ${className}`}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
