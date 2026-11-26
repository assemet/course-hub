import { useState, useEffect } from 'react';
import { UserProvider, useUser } from '@/hooks/useUser';
import { BottomNav, type TabKey } from '@/components/BottomNav';
import { LoadingScreen } from '@/components/Spinner';
import { ErrorState } from '@/components/StateViews';
import { MessageCircle } from 'lucide-react';
import { StudentHome } from '@/screens/StudentHome';
import { CourseList } from '@/screens/CourseList';
import { CoursePage } from '@/screens/CoursePage';
import { LessonPage } from '@/screens/LessonPage';
import { Profile } from '@/screens/Profile';
import { CreatorDashboard } from '@/screens/CreatorDashboard';
import { CourseEditor } from '@/screens/CourseEditor';
import { ImportInbox } from '@/screens/ImportInbox';
import { useI18n } from '@/lib/i18n';
import { getDeepLinkCourseId } from '@/lib/deepLink';

type Screen =
  | { name: 'tab' }
  | { name: 'course'; courseId: string }
  | { name: 'lesson'; courseId: string; lessonId: string }
  | { name: 'creator-dashboard' }
  | { name: 'import-inbox' }
  | { name: 'course-editor'; courseId: string | null; isNew: boolean };

function AppContent() {
  const { user, loading, error, notInTelegram } = useUser();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [screenStack, setScreenStack] = useState<Screen[]>([]);

  // Handle deep link on mount
  useEffect(() => {
    if (!user) return;
    const deepLinkCourseId = getDeepLinkCourseId();
    if (deepLinkCourseId) {
      setScreenStack([{ name: 'course', courseId: deepLinkCourseId }]);
    }
  }, [user]);

  if (loading) return <LoadingScreen message={t('app.starting')} />;
  if (notInTelegram) {
    return (
      <div className="min-h-screen bg-slate-50 max-w-lg mx-auto flex flex-col items-center justify-center px-6 text-center">
        <div className="h-16 w-16 rounded-2xl bg-sky-100 flex items-center justify-center mb-4">
          <MessageCircle className="h-8 w-8 text-sky-500" />
        </div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">{t('app.openInTelegram.title')}</h1>
        <p className="text-sm text-slate-500 max-w-xs">{t('app.openInTelegram.body')}</p>
      </div>
    );
  }
  if (error) return <ErrorState message={error} />;
  if (!user) return <ErrorState message={t('app.profileLoadFailed')} />;

  const currentScreen = screenStack[screenStack.length - 1];

  const pushScreen = (screen: Screen) => setScreenStack((s) => [...s, screen]);
  const popScreen = () => setScreenStack((s) => s.slice(0, -1));
  const resetToTab = (tab: TabKey) => {
    setActiveTab(tab);
    setScreenStack([]);
  };

  // If we have a screen stack, render the top screen
  if (currentScreen) {
    switch (currentScreen.name) {
      case 'course':
        return (
          <div className="min-h-screen bg-slate-50 max-w-lg mx-auto">
            <CoursePage
              courseId={currentScreen.courseId}
              onBack={popScreen}
              onOpenLesson={(courseId, lessonId) => pushScreen({ name: 'lesson', courseId, lessonId })}
            />
          </div>
        );
      case 'lesson':
        return (
          <div className="min-h-screen bg-slate-50 max-w-lg mx-auto">
            <LessonPage
              courseId={currentScreen.courseId}
              lessonId={currentScreen.lessonId}
              onBack={popScreen}
              onNavigateLesson={(courseId, lessonId) => {
                setScreenStack((s) => [...s.slice(0, -1), { name: 'lesson', courseId, lessonId }]);
              }}
            />
          </div>
        );
      case 'course-editor':
        return (
          <div className="min-h-screen bg-slate-50 max-w-lg mx-auto">
            <CourseEditor
              courseId={currentScreen.courseId}
              isNew={currentScreen.isNew}
              onBack={popScreen}
            />
          </div>
        );
      case 'import-inbox':
        return (
          <div className="min-h-screen bg-slate-50 max-w-lg mx-auto">
            <ImportInbox onBack={popScreen} />
          </div>
        );
      default:
        break;
    }
  }

  // Default tab rendering
  const isCreator = user.role === 'creator';
  const effectiveTab = isCreator && activeTab === 'home' ? 'dashboard' : activeTab;

  return (
    <div className="min-h-screen bg-slate-50 max-w-lg mx-auto">
      <div className="pb-20">
        {effectiveTab === 'home' && (
          <StudentHome
            onOpenCourse={(courseId) => pushScreen({ name: 'course', courseId })}
            onOpenLesson={(courseId, lessonId) => pushScreen({ name: 'lesson', courseId, lessonId })}
          />
        )}
        {effectiveTab === 'courses' && (
          <CourseList onOpenCourse={(courseId) => pushScreen({ name: 'course', courseId })} />
        )}
        {effectiveTab === 'profile' && <Profile />}
        {effectiveTab === 'dashboard' && (
          <CreatorDashboard
            onEditCourse={(courseId) => pushScreen({ name: 'course-editor', courseId, isNew: false })}
            onCreateCourse={() => pushScreen({ name: 'course-editor', courseId: null, isNew: true })}
            onOpenImports={() => pushScreen({ name: 'import-inbox' })}
          />
        )}
      </div>
      <BottomNav activeTab={effectiveTab} onTabChange={resetToTab} role={user.role} />
    </div>
  );
}

export default function App() {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
}
