import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  const base = 'bg-surface rounded-[20px] shadow-[0_1px_3px_rgba(11,36,99,0.06)]';
  const interactive = onClick
    ? 'cursor-pointer hover:shadow-md active:scale-[0.99] transition-all duration-200'
    : '';
  return (
    <div className={`${base} ${interactive} ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}
