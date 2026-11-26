import { useState } from 'react';
import { ArrowLeftRight, Info, Bell, Shield, Languages } from 'lucide-react';
import { Card } from '@/components/Card';
import { useUser } from '@/hooks/useUser';
import { isRunningInTelegram } from '@/lib/telegram';
import { useI18n, type Lang } from '@/lib/i18n';

// Each language is shown in its own name, so it's recognizable whatever the current UI language.
const LANGUAGES: Array<{ code: Lang; label: string }> = [
  { code: 'ar', label: 'العربية' },
  { code: 'en', label: 'English' },
];

export function Profile() {
  const { user, toggleRole } = useUser();
  const { t, lang, setLang } = useI18n();
  const [toggling, setToggling] = useState(false);

  const handleToggleRole = async () => {
    setToggling(true);
    try {
      await toggleRole();
    } catch {
      // ignore
    } finally {
      setToggling(false);
    }
  };

  if (!user) return null;

  return (
    <div className="px-4 py-5 space-y-5">
      {/* Profile header */}
      <Card className="p-6 text-center">
        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-2xl mx-auto">
          {user.first_name.charAt(0).toUpperCase()}
        </div>
        <h1 dir="auto" className="text-xl font-bold text-slate-900 mt-3">{user.first_name}</h1>
        {user.username && (
          <p dir="ltr" className="text-sm text-slate-500 mt-1">@{user.username}</p>
        )}
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100">
          <span className="text-xs font-medium text-slate-600">
            {user.role === 'creator' ? t('profile.role.creator') : t('profile.role.student')}
          </span>
        </div>
      </Card>

      {/* Role switcher */}
      <Card className="p-4">
        <button
          onClick={handleToggleRole}
          disabled={toggling}
          className="flex items-center gap-3 w-full text-start enabled:hover:bg-slate-50 enabled:active:scale-[0.99] transition-all rounded-xl"
        >
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <ArrowLeftRight className="h-5 w-5 text-blue-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">
              {user.role === 'student' ? t('profile.switchToCreator') : t('profile.switchToStudent')}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {user.role === 'student' ? t('profile.creatorHint') : t('profile.studentHint')}
            </p>
          </div>
        </button>
      </Card>

      {/* Language */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Languages className="h-5 w-5 text-blue-500" />
          </div>
          <p className="flex-1 text-sm font-semibold text-slate-900">{t('profile.language')}</p>
          <div className="flex rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label={t('profile.language')}>
            {LANGUAGES.map((option) => (
              <button
                key={option.code}
                role="radio"
                aria-checked={lang === option.code}
                onClick={() => setLang(option.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  lang === option.code ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* App info */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide px-1">{t('profile.about')}</h2>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Info className="h-5 w-5 text-slate-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{t('app.name')}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t('profile.version')}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Bell className="h-5 w-5 text-slate-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{t('profile.notifications')}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t('profile.notificationsBody')}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-slate-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{t('profile.environment')}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {isRunningInTelegram() ? t('profile.inTelegram') : t('profile.browser')}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
