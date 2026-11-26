import { Home, BookOpen, User as UserIcon, LayoutDashboard } from 'lucide-react';
import type { UserRole } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

export type TabKey = 'home' | 'courses' | 'profile' | 'dashboard';

interface BottomNavProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  role: UserRole;
}

interface TabConfig {
  key: TabKey;
  label: string;
  icon: typeof Home;
}

export function BottomNav({ activeTab, onTabChange, role }: BottomNavProps) {
  const { t } = useI18n();
  const tabs: TabConfig[] =
    role === 'creator'
      ? [
          { key: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
          { key: 'courses', label: t('nav.browse'), icon: BookOpen },
          { key: 'profile', label: t('nav.profile'), icon: UserIcon },
        ]
      : [
          { key: 'home', label: t('nav.home'), icon: Home },
          { key: 'courses', label: t('nav.courses'), icon: BookOpen },
          { key: 'profile', label: t('nav.profile'), icon: UserIcon },
        ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 backdrop-blur-md border-t border-slate-200/60 pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              className="flex flex-col items-center gap-1 px-4 py-2 transition-all"
              aria-label={tab.label}
            >
              <Icon
                className={`h-6 w-6 transition-colors ${
                  active ? 'text-blue-500' : 'text-slate-400'
                }`}
                strokeWidth={active ? 2.5 : 2}
              />
              <span
                className={`text-[11px] font-medium transition-colors ${
                  active ? 'text-blue-500' : 'text-slate-400'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
