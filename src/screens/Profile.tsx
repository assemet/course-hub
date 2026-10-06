import { useState } from 'react';
import { User as UserIcon, ArrowLeftRight, Info, Bell, Shield } from 'lucide-react';
import { Card } from '@/components/Card';
import { useUser } from '@/hooks/useUser';
import { isRunningInTelegram } from '@/lib/telegram';

export function Profile() {
  const { user, toggleRole } = useUser();
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
        <h1 className="text-xl font-bold text-slate-900 mt-3">{user.first_name}</h1>
        {user.username && (
          <p className="text-sm text-slate-500 mt-1">@{user.username}</p>
        )}
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100">
          <span className="text-xs font-medium text-slate-600 capitalize">{user.role}</span>
        </div>
      </Card>

      {/* Role switcher */}
      <Card className="p-4">
        <button
          onClick={handleToggleRole}
          disabled={toggling}
          className="flex items-center gap-3 w-full text-left enabled:hover:bg-slate-50 enabled:active:scale-[0.99] transition-all rounded-xl"
        >
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <ArrowLeftRight className="h-5 w-5 text-blue-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-slate-900">
              Switch to {user.role === 'student' ? 'Creator' : 'Student'} mode
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {user.role === 'student'
                ? 'Create and manage courses'
                : 'Browse and learn from courses'}
            </p>
          </div>
        </button>
      </Card>

      {/* App info */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide px-1">About</h2>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Info className="h-5 w-5 text-slate-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">Course Tracker</p>
              <p className="text-xs text-slate-500 mt-0.5">Version 1.0.0 — MVP</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Bell className="h-5 w-5 text-slate-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Reminder system is prepared — coming soon
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
              <Shield className="h-5 w-5 text-slate-500" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">Environment</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {isRunningInTelegram() ? 'Running inside Telegram' : 'Browser (dev mode)'}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
