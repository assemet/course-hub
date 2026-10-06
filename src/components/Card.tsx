import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  const base = 'bg-white rounded-2xl border border-slate-200/80 shadow-sm';
  const interactive = onClick
    ? 'cursor-pointer hover:border-blue-300 hover:shadow-md active:scale-[0.99] transition-all duration-200'
    : '';
  return (
    <div className={`${base} ${interactive} ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}
