import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getTelegramUser } from './telegram';

export type Lang = 'ar' | 'en';

type Vars = Record<string, string | number>;
type Entry = string | ((v: Vars) => string);

const STORAGE_KEY = 'course-hub.lang';

// ---------------------------------------------------------------------------
// Plural helpers
// ---------------------------------------------------------------------------

type ArForms = { zero: string; one: string; two: string; few: string; many: string; other: string };

const arRules = new Intl.PluralRules('ar');

/** Arabic has six plural forms; `{n}` in a form is replaced with the number. */
function arPlural(n: number, forms: ArForms): string {
  const form = arRules.select(n) as keyof ArForms;
  return (forms[form] ?? forms.other).replace('{n}', String(n));
}

function enPlural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const num = (v: Vars) => Number(v.n ?? 0);

// ---------------------------------------------------------------------------
// Dictionaries
// ---------------------------------------------------------------------------

const en = {
  // app shell
  'app.name': 'Course Hub',
  'app.starting': 'Starting Course Hub...',
  'app.openInTelegram.title': 'Open in Telegram',
  'app.openInTelegram.body':
    'Please open this app inside Telegram to use it. Launch the bot from your Telegram chat to get started.',
  'app.profileLoadFailed': 'Could not load your profile. Please refresh.',

  // common
  'common.loading': 'Loading...',
  'common.tryAgain': 'Try again',
  'common.noDescription': 'No description',
  'common.untitled': 'Untitled',
  'common.add': 'Add',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.dismiss': 'Dismiss',
  'common.back': 'Go back',
  'common.delete': 'Delete',
  'common.refresh': 'Refresh',
  'common.courseNotFound': 'Course not found',
  'common.lessonsCount': (v: Vars) => enPlural(num(v), 'lesson', 'lessons'),
  'common.modulesCount': (v: Vars) => enPlural(num(v), 'module', 'modules'),
  'common.studentsCount': (v: Vars) => enPlural(num(v), 'student', 'students'),
  'common.lessonsProgress': '{done}/{total} lessons',

  // bottom nav
  'nav.dashboard': 'Dashboard',
  'nav.browse': 'Browse',
  'nav.profile': 'Profile',
  'nav.home': 'Home',
  'nav.courses': 'Courses',

  // course status
  'status.published': 'Published',
  'status.draft': 'Draft',

  // creator dashboard
  'dash.loading': 'Loading dashboard...',
  'dash.loadFailed': 'Failed to load dashboard',
  'dash.title': 'Dashboard',
  'dash.subtitle': 'Manage your courses',
  'dash.create': 'Create',
  'dash.empty.title': 'No courses yet',
  'dash.empty.desc': 'Create your first course to get started.',
  'dash.createCourse': 'Create Course',
  'dash.inbox.title': 'Import Inbox',
  'dash.inbox.pending': (v: Vars) =>
    num(v) === 0
      ? 'Forward posts from your channel to the bot to turn them into lessons'
      : `${enPlural(num(v), 'message', 'messages')} waiting to be imported`,

  // import inbox
  'inbox.title': 'Import Inbox',
  'inbox.loading': 'Loading forwarded messages...',
  'inbox.loadFailed': 'Failed to load imports',
  'inbox.importFailed': 'Failed to import message',
  'inbox.deleteFailed': 'Failed to delete',
  'inbox.confirmDelete': 'Delete this forwarded message?',
  'inbox.banner.title': 'Forward messages to import',
  'inbox.banner.body':
    "Forward messages from your Telegram channel to the bot. They'll appear here for quick import into your courses.",
  'inbox.openBot': 'Open the bot',
  'inbox.targetCourse': 'Import to course',
  'inbox.module': 'Module',
  'inbox.selectModule': 'Select a module...',
  'inbox.noModules': 'This course has no modules yet. Add one in the course editor first.',
  'inbox.noCourses.title': 'Create a course first',
  'inbox.noCourses.desc': 'Imported messages become lessons inside one of your course modules.',
  'inbox.empty.title': 'No forwarded messages',
  'inbox.empty.desc': 'Forward messages from your Telegram channel to the bot to see them here.',
  'inbox.pendingCount': (v: Vars) => `${enPlural(num(v), 'pending message', 'pending messages')}`,
  'inbox.importing': 'Importing...',
  'inbox.importToModule': 'Import to module',
  'inbox.imported': 'Added as a lesson',

  // media types
  'media.video': 'Video',
  'media.pdf': 'PDF',
  'media.text': 'Text',
  'media.link': 'Link',
  'media.image': 'Image',
  'media.file': 'File',
  'media.audio': 'Audio',

  // lesson attachments
  'lessonMedia.sendToChat': 'Send to my Telegram chat',
  'lessonMedia.saveImage': 'Send to my chat to save it',
  'lessonMedia.sending': 'Sending...',
  'lessonMedia.sent': 'Sent to your chat with the bot',
  'lessonMedia.openChat': 'Open chat',
  'lessonMedia.hint': 'The file will arrive in your chat with the bot, where you can open, play or save it.',
  'lessonMedia.needsAccess': 'The bot needs permission to message you. Open the bot, press Start, then try again.',
  'lessonMedia.failed': "Couldn't send the file. Please try again later.",
  'lessonMedia.imageFailed': "This image can't be shown here, but you can receive it in your chat.",

  // resource types
  'resource.pdf': 'PDF',
  'resource.file': 'File',
  'resource.link': 'Link',
  'resource.telegram': 'Telegram',

  // course list
  'courses.loading': 'Loading courses...',
  'courses.loadFailed': 'Failed to load courses',
  'courses.title': 'Courses',
  'courses.subtitle': 'Browse and enroll in available courses',
  'courses.empty.title': 'No courses available',
  'courses.empty.desc': 'Check back later for new courses.',
  'courses.enroll': 'Enroll & start',

  // student home
  'home.loading': 'Loading your courses...',
  'home.loadFailed': 'Failed to load your courses',
  'home.welcome': 'Welcome back,',
  'home.continue': 'Continue Learning',
  'home.next': 'Next: {module} — {lesson}',
  'home.caughtUp': 'All caught up — review anytime',
  'home.continueBtn': 'Continue',
  'home.review': 'Review course',
  'home.empty.title': 'No courses yet',
  'home.empty.desc': 'Browse available courses and start learning today.',
  'home.myCourses': 'My Courses',
  'home.notEnrolled': "You haven't enrolled in any courses yet.",

  // course page
  'course.title': 'Course',
  'course.loading': 'Loading course...',
  'course.loadFailed': 'Failed to load course',
  'course.share': 'Share course',
  'course.copyPrompt': 'Copy this link:',
  'course.by': 'by {name}',
  'course.overall': 'Overall Progress',
  'course.moduleProgress': '{done}/{total} lessons completed',
  'course.noLessons': 'No lessons yet',
  'course.shareLink': 'Share link: {link}',
  'course.copied': 'Copied!',
  'course.copyLink': 'Copy link',

  // lesson page
  'lesson.title': 'Lesson',
  'lesson.loading': 'Loading lesson...',
  'lesson.loadFailed': 'Failed to load lesson',
  'lesson.notFound': 'Lesson not found',
  'lesson.markFailed': 'Failed to mark lesson as complete',
  'lesson.viewOnTelegram': 'View on Telegram',
  'lesson.openOriginal': 'Open the original Telegram content',
  'lesson.resources': 'Resources',
  'lesson.prev': 'Previous',
  'lesson.next': 'Next',
  'lesson.completedNext': 'Lesson completed! Next lesson is ready.',
  'lesson.completedDone': 'Lesson completed!',
  'lesson.completed': 'Completed',
  'lesson.saving': 'Saving...',
  'lesson.markComplete': 'Mark as Completed',

  // profile
  'profile.role.student': 'Student',
  'profile.role.creator': 'Creator',
  'profile.switchToCreator': 'Switch to Creator mode',
  'profile.switchToStudent': 'Switch to Student mode',
  'profile.creatorHint': 'Create and manage courses',
  'profile.studentHint': 'Browse and learn from courses',
  'profile.language': 'Language',
  'profile.about': 'About',
  'profile.version': 'Version 1.0.0 — MVP',
  'profile.notifications': 'Notifications',
  'profile.notificationsBody': 'Reminder system is prepared — coming soon',
  'profile.environment': 'Environment',
  'profile.inTelegram': 'Running inside Telegram',
  'profile.browser': 'Browser (dev mode)',

  // course editor
  'editor.create': 'Create Course',
  'editor.edit': 'Edit Course',
  'editor.notOwner': 'You can only edit your own courses',
  'editor.slugInvalid': 'Slug can only contain lowercase letters, numbers and single hyphens',
  'editor.coverInvalid': 'Cover image must be a valid http(s) link',
  'editor.slugTaken': 'That slug is already taken — choose another one',
  'editor.saveFailed': 'Failed to save course',
  'editor.statusFailed': 'Failed to update status',
  'editor.addModuleFailed': 'Failed to add module',
  'editor.renameModuleFailed': 'Failed to rename module',
  'editor.deleteModuleFailed': 'Failed to delete module',
  'editor.reorderModulesFailed': 'Failed to reorder modules',
  'editor.confirmDeleteModule': 'Delete this module and all its lessons?',
  'editor.lessonUrlInvalid': 'Lesson link must be a valid http(s) or t.me link',
  'editor.saveLessonFailed': 'Failed to save lesson',
  'editor.deleteLessonFailed': 'Failed to delete lesson',
  'editor.reorderLessonsFailed': 'Failed to reorder lessons',
  'editor.confirmDeleteLesson': 'Delete this lesson?',
  'editor.resourceUrlInvalid': 'Resource link must be a valid http(s) or t.me link',
  'editor.addResourceFailed': 'Failed to add resource',
  'editor.deleteResourceFailed': 'Failed to delete resource',
  'editor.publish': 'Publish',
  'editor.unpublish': 'Unpublish',
  'editor.tab.overview': 'Overview',
  'editor.tab.modules': 'Modules',
  'editor.courseTitle': 'Course Title',
  'editor.courseTitlePh': 'e.g. Python for Beginners',
  'editor.description': 'Description',
  'editor.descriptionPh': 'Short course description',
  'editor.cover': 'Cover Image URL (optional)',
  'editor.slug': 'Course Slug (optional)',
  'editor.saveChanges': 'Save Changes',
  'editor.statusLabel': 'Status: {status}',
  'editor.publishedHint': 'Students can see and enroll in this course',
  'editor.draftHint': 'Only you can see this course',
  'editor.newModulePh': 'New module title',
  'editor.noModules.title': 'No modules yet',
  'editor.noModules.desc': 'Add your first module above to start building the course structure.',
  'editor.moveUp': 'Move up',
  'editor.moveDown': 'Move down',
  'editor.rename': 'Rename',
  'editor.editLesson': 'Edit lesson',
  'editor.addLesson': 'Add Lesson',
  'editor.lesson.edit': 'Edit Lesson',
  'editor.lesson.new': 'New Lesson',
  'editor.lesson.title': 'Lesson Title',
  'editor.lesson.titlePh': 'e.g. Introduction to Variables',
  'editor.lesson.description': 'Description (optional)',
  'editor.lesson.descriptionPh': 'Short description',
  'editor.lesson.content': 'Content',
  'editor.lesson.contentPh': 'Write the lesson content here...',
  'editor.lesson.telegramUrl': 'Telegram Content URL (optional)',
  'editor.lesson.save': 'Save Lesson',
  'editor.res.titlePh': 'Resource title',
  'editor.res.type.link': 'External Link',
  'editor.res.type.pdf': 'PDF',
  'editor.res.type.file': 'File',
  'editor.res.type.telegram': 'Telegram Link',
  'editor.res.urlPh': 'URL',
  'editor.res.save': 'Save Resource',
  'editor.res.none': 'No resources yet',
} satisfies Record<string, Entry>;

export type TKey = keyof typeof en;

const ar: Record<TKey, Entry> = {
  'app.name': 'Course Hub',
  'app.starting': 'جارٍ تشغيل Course Hub...',
  'app.openInTelegram.title': 'افتح التطبيق من تيليغرام',
  'app.openInTelegram.body': 'هذا التطبيق يعمل داخل تيليغرام فقط. افتح البوت من محادثاتك في تيليغرام للبدء.',
  'app.profileLoadFailed': 'تعذّر تحميل ملفك الشخصي. أعد تحميل الصفحة.',

  'common.loading': 'جارٍ التحميل...',
  'common.tryAgain': 'إعادة المحاولة',
  'common.noDescription': 'لا يوجد وصف',
  'common.untitled': 'بدون عنوان',
  'common.add': 'إضافة',
  'common.cancel': 'إلغاء',
  'common.close': 'إغلاق',
  'common.dismiss': 'إخفاء',
  'common.back': 'رجوع',
  'common.delete': 'حذف',
  'common.refresh': 'تحديث',
  'common.courseNotFound': 'الدورة غير موجودة',
  'common.lessonsCount': (v) =>
    arPlural(num(v), { zero: 'لا دروس', one: 'درس واحد', two: 'درسان', few: '{n} دروس', many: '{n} درسًا', other: '{n} درس' }),
  'common.modulesCount': (v) =>
    arPlural(num(v), { zero: 'لا وحدات', one: 'وحدة واحدة', two: 'وحدتان', few: '{n} وحدات', many: '{n} وحدة', other: '{n} وحدة' }),
  'common.studentsCount': (v) =>
    arPlural(num(v), { zero: 'لا طلاب', one: 'طالب واحد', two: 'طالبان', few: '{n} طلاب', many: '{n} طالبًا', other: '{n} طالب' }),
  'common.lessonsProgress': 'الدروس: {done}/{total}',

  'nav.dashboard': 'لوحة التحكم',
  'nav.browse': 'تصفّح',
  'nav.profile': 'حسابي',
  'nav.home': 'الرئيسية',
  'nav.courses': 'الدورات',

  'status.published': 'منشورة',
  'status.draft': 'مسودة',

  'dash.loading': 'جارٍ تحميل لوحة التحكم...',
  'dash.loadFailed': 'تعذّر تحميل لوحة التحكم',
  'dash.title': 'لوحة التحكم',
  'dash.subtitle': 'إدارة دوراتك',
  'dash.create': 'إنشاء',
  'dash.empty.title': 'لا توجد دورات بعد',
  'dash.empty.desc': 'أنشئ دورتك الأولى للبدء.',
  'dash.createCourse': 'إنشاء دورة',
  'dash.inbox.title': 'صندوق الاستيراد',
  'dash.inbox.pending': (v) =>
    arPlural(num(v), {
      zero: 'أعد توجيه منشورات قناتك إلى البوت لتحويلها إلى دروس',
      one: 'رسالة واحدة بانتظار الاستيراد',
      two: 'رسالتان بانتظار الاستيراد',
      few: '{n} رسائل بانتظار الاستيراد',
      many: '{n} رسالة بانتظار الاستيراد',
      other: '{n} رسالة بانتظار الاستيراد',
    }),

  'inbox.title': 'صندوق الاستيراد',
  'inbox.loading': 'جارٍ تحميل الرسائل المعاد توجيهها...',
  'inbox.loadFailed': 'تعذّر تحميل الرسائل',
  'inbox.importFailed': 'تعذّر استيراد الرسالة',
  'inbox.deleteFailed': 'تعذّر الحذف',
  'inbox.confirmDelete': 'حذف هذه الرسالة؟',
  'inbox.banner.title': 'أعد توجيه الرسائل لاستيرادها',
  'inbox.banner.body': 'أعد توجيه الرسائل من قناتك على تيليغرام إلى البوت، وستظهر هنا لتحوّلها إلى دروس بضغطة واحدة.',
  'inbox.openBot': 'فتح البوت',
  'inbox.targetCourse': 'الاستيراد إلى الدورة',
  'inbox.module': 'الوحدة',
  'inbox.selectModule': 'اختر وحدة...',
  'inbox.noModules': 'لا توجد وحدات في هذه الدورة بعد. أضف وحدة من محرر الدورة أولاً.',
  'inbox.noCourses.title': 'أنشئ دورة أولاً',
  'inbox.noCourses.desc': 'الرسائل المستوردة تصبح دروساً داخل إحدى وحدات دوراتك.',
  'inbox.empty.title': 'لا توجد رسائل',
  'inbox.empty.desc': 'أعد توجيه الرسائل من قناتك إلى البوت لتظهر هنا.',
  'inbox.pendingCount': (v) =>
    arPlural(num(v), {
      zero: 'لا رسائل بانتظار الاستيراد',
      one: 'رسالة واحدة بانتظار الاستيراد',
      two: 'رسالتان بانتظار الاستيراد',
      few: '{n} رسائل بانتظار الاستيراد',
      many: '{n} رسالة بانتظار الاستيراد',
      other: '{n} رسالة بانتظار الاستيراد',
    }),
  'inbox.importing': 'جارٍ الاستيراد...',
  'inbox.importToModule': 'استيراد إلى الوحدة',
  'inbox.imported': 'أُضيفت كدرس',

  'media.video': 'فيديو',
  'media.pdf': 'PDF',
  'media.text': 'نص',
  'media.link': 'رابط',
  'media.image': 'صورة',
  'media.file': 'ملف',
  'media.audio': 'تسجيل صوتي',

  'lessonMedia.sendToChat': 'إرسال إلى محادثتي في تيليغرام',
  'lessonMedia.saveImage': 'أرسلها إلى محادثتي لحفظها',
  'lessonMedia.sending': 'جارٍ الإرسال...',
  'lessonMedia.sent': 'أُرسل إلى محادثتك مع البوت',
  'lessonMedia.openChat': 'فتح المحادثة',
  'lessonMedia.hint': 'سيصلك الملف في محادثتك مع البوت، وهناك تفتحه أو تشغّله أو تحفظه.',
  'lessonMedia.needsAccess': 'يحتاج البوت إذناً لمراسلتك. افتح البوت واضغط «ابدأ»، ثم أعد المحاولة.',
  'lessonMedia.failed': 'تعذّر إرسال الملف. حاول مرة أخرى لاحقاً.',
  'lessonMedia.imageFailed': 'لا يمكن عرض هذه الصورة هنا، لكن يمكنك استلامها في محادثتك.',

  'resource.pdf': 'PDF',
  'resource.file': 'ملف',
  'resource.link': 'رابط',
  'resource.telegram': 'تيليغرام',

  'courses.loading': 'جارٍ تحميل الدورات...',
  'courses.loadFailed': 'تعذّر تحميل الدورات',
  'courses.title': 'الدورات',
  'courses.subtitle': 'تصفّح الدورات المتاحة وسجّل فيها',
  'courses.empty.title': 'لا توجد دورات متاحة',
  'courses.empty.desc': 'عد لاحقاً لاكتشاف دورات جديدة.',
  'courses.enroll': 'سجّل وابدأ',

  'home.loading': 'جارٍ تحميل دوراتك...',
  'home.loadFailed': 'تعذّر تحميل دوراتك',
  'home.welcome': 'أهلاً بعودتك،',
  'home.continue': 'تابع التعلّم',
  'home.next': 'التالي: {module} — {lesson}',
  'home.caughtUp': 'أنهيت كل الدروس، راجعها متى شئت',
  'home.continueBtn': 'متابعة',
  'home.review': 'مراجعة الدورة',
  'home.empty.title': 'لا توجد دورات بعد',
  'home.empty.desc': 'تصفّح الدورات المتاحة وابدأ التعلّم اليوم.',
  'home.myCourses': 'دوراتي',
  'home.notEnrolled': 'لم تسجّل في أي دورة بعد.',

  'course.title': 'الدورة',
  'course.loading': 'جارٍ تحميل الدورة...',
  'course.loadFailed': 'تعذّر تحميل الدورة',
  'course.share': 'مشاركة الدورة',
  'course.copyPrompt': 'انسخ هذا الرابط:',
  'course.by': 'بواسطة {name}',
  'course.overall': 'التقدّم العام',
  'course.moduleProgress': 'أنجزت {done} من {total}',
  'course.noLessons': 'لا توجد دروس بعد',
  'course.shareLink': 'رابط المشاركة: {link}',
  'course.copied': 'تم النسخ!',
  'course.copyLink': 'نسخ الرابط',

  'lesson.title': 'الدرس',
  'lesson.loading': 'جارٍ تحميل الدرس...',
  'lesson.loadFailed': 'تعذّر تحميل الدرس',
  'lesson.notFound': 'الدرس غير موجود',
  'lesson.markFailed': 'تعذّر حفظ إكمال الدرس',
  'lesson.viewOnTelegram': 'عرض على تيليغرام',
  'lesson.openOriginal': 'فتح المحتوى الأصلي في تيليغرام',
  'lesson.resources': 'المرفقات',
  'lesson.prev': 'السابق',
  'lesson.next': 'التالي',
  'lesson.completedNext': 'أحسنت! أنهيت الدرس، والدرس التالي جاهز.',
  'lesson.completedDone': 'أحسنت! أنهيت الدرس.',
  'lesson.completed': 'مكتمل',
  'lesson.saving': 'جارٍ الحفظ...',
  'lesson.markComplete': 'تحديد كمكتمل',

  'profile.role.student': 'طالب',
  'profile.role.creator': 'صانع محتوى',
  'profile.switchToCreator': 'التحويل إلى وضع صانع المحتوى',
  'profile.switchToStudent': 'التحويل إلى وضع الطالب',
  'profile.creatorHint': 'أنشئ دوراتك وأدِرها',
  'profile.studentHint': 'تصفّح الدورات وتعلّم منها',
  'profile.language': 'اللغة',
  'profile.about': 'حول التطبيق',
  'profile.version': 'الإصدار 1.0.0 — نسخة تجريبية',
  'profile.notifications': 'الإشعارات',
  'profile.notificationsBody': 'نظام التذكيرات قيد التجهيز، قريباً',
  'profile.environment': 'البيئة',
  'profile.inTelegram': 'يعمل داخل تيليغرام',
  'profile.browser': 'متصفح (وضع التطوير)',

  'editor.create': 'إنشاء دورة',
  'editor.edit': 'تعديل الدورة',
  'editor.notOwner': 'يمكنك تعديل دوراتك فقط',
  'editor.slugInvalid': 'المعرّف المختصر يقبل الأحرف الإنجليزية الصغيرة والأرقام والشرطات المفردة فقط',
  'editor.coverInvalid': 'رابط صورة الغلاف يجب أن يكون رابط http(s) صالحاً',
  'editor.slugTaken': 'هذا المعرّف مستخدم، اختر غيره',
  'editor.saveFailed': 'تعذّر حفظ الدورة',
  'editor.statusFailed': 'تعذّر تغيير حالة الدورة',
  'editor.addModuleFailed': 'تعذّرت إضافة الوحدة',
  'editor.renameModuleFailed': 'تعذّرت إعادة تسمية الوحدة',
  'editor.deleteModuleFailed': 'تعذّر حذف الوحدة',
  'editor.reorderModulesFailed': 'تعذّر تغيير ترتيب الوحدات',
  'editor.confirmDeleteModule': 'حذف هذه الوحدة وكل دروسها؟',
  'editor.lessonUrlInvalid': 'رابط الدرس يجب أن يكون رابط http(s) أو t.me صالحاً',
  'editor.saveLessonFailed': 'تعذّر حفظ الدرس',
  'editor.deleteLessonFailed': 'تعذّر حذف الدرس',
  'editor.reorderLessonsFailed': 'تعذّر تغيير ترتيب الدروس',
  'editor.confirmDeleteLesson': 'حذف هذا الدرس؟',
  'editor.resourceUrlInvalid': 'رابط المرفق يجب أن يكون رابط http(s) أو t.me صالحاً',
  'editor.addResourceFailed': 'تعذّرت إضافة المرفق',
  'editor.deleteResourceFailed': 'تعذّر حذف المرفق',
  'editor.publish': 'نشر',
  'editor.unpublish': 'إلغاء النشر',
  'editor.tab.overview': 'نظرة عامة',
  'editor.tab.modules': 'الوحدات',
  'editor.courseTitle': 'عنوان الدورة',
  'editor.courseTitlePh': 'مثال: بايثون للمبتدئين',
  'editor.description': 'الوصف',
  'editor.descriptionPh': 'وصف مختصر للدورة',
  'editor.cover': 'رابط صورة الغلاف (اختياري)',
  'editor.slug': 'المعرّف المختصر للدورة (اختياري)',
  'editor.saveChanges': 'حفظ التغييرات',
  'editor.statusLabel': 'الحالة: {status}',
  'editor.publishedHint': 'يستطيع الطلاب رؤية الدورة والتسجيل فيها',
  'editor.draftHint': 'هذه الدورة مرئية لك فقط',
  'editor.newModulePh': 'عنوان الوحدة الجديدة',
  'editor.noModules.title': 'لا توجد وحدات بعد',
  'editor.noModules.desc': 'أضف وحدتك الأولى من الأعلى لبدء بناء الدورة.',
  'editor.moveUp': 'تحريك للأعلى',
  'editor.moveDown': 'تحريك للأسفل',
  'editor.rename': 'إعادة تسمية',
  'editor.editLesson': 'تعديل الدرس',
  'editor.addLesson': 'إضافة درس',
  'editor.lesson.edit': 'تعديل الدرس',
  'editor.lesson.new': 'درس جديد',
  'editor.lesson.title': 'عنوان الدرس',
  'editor.lesson.titlePh': 'مثال: مقدمة في المتغيرات',
  'editor.lesson.description': 'الوصف (اختياري)',
  'editor.lesson.descriptionPh': 'وصف مختصر',
  'editor.lesson.content': 'المحتوى',
  'editor.lesson.contentPh': 'اكتب محتوى الدرس هنا...',
  'editor.lesson.telegramUrl': 'رابط المحتوى على تيليغرام (اختياري)',
  'editor.lesson.save': 'حفظ الدرس',
  'editor.res.titlePh': 'عنوان المرفق',
  'editor.res.type.link': 'رابط خارجي',
  'editor.res.type.pdf': 'PDF',
  'editor.res.type.file': 'ملف',
  'editor.res.type.telegram': 'رابط تيليغرام',
  'editor.res.urlPh': 'الرابط',
  'editor.res.save': 'حفظ المرفق',
  'editor.res.none': 'لا توجد مرفقات بعد',
};

const dictionaries: Record<Lang, Record<TKey, Entry>> = { en, ar };

// ---------------------------------------------------------------------------
// Language detection & persistence
// ---------------------------------------------------------------------------

function readStoredLang(): Lang | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'ar' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage can be unavailable in some webviews; the choice just won't persist
  }
}

/**
 * Explicit choice wins; otherwise follow the Telegram client language.
 * Arabic is the default when Telegram doesn't tell us.
 */
function detectLang(): Lang {
  const stored = readStoredLang();
  if (stored) return stored;
  const code = getTelegramUser()?.language_code?.toLowerCase();
  if (code && !code.startsWith('ar')) return 'en';
  return 'ar';
}

function applyDocumentLang(lang: Lang): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

// ---------------------------------------------------------------------------
// React context
// ---------------------------------------------------------------------------

export type TFunction = (key: TKey, vars?: Vars) => string;

interface I18nValue {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang: (lang: Lang) => void;
  t: TFunction;
  formatDate: (iso: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => applyDocumentLang(lang), [lang]);

  const setLang = useCallback((next: Lang) => {
    storeLang(next);
    setLangState(next);
  }, []);

  const value = useMemo<I18nValue>(() => {
    const dict = dictionaries[lang];
    const t: TFunction = (key, vars = {}) => {
      const entry = dict[key] ?? en[key];
      if (typeof entry === 'function') return entry(vars);
      return entry.replace(/\{(\w+)\}/g, (_, name: string) =>
        name in vars ? String(vars[name]) : `{${name}}`
      );
    };
    // Latin digits read more naturally across the Arab world in a mixed UI.
    const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en';
    const formatDate = (iso: string) => new Date(iso).toLocaleDateString(locale);
    return { lang, dir: lang === 'ar' ? 'rtl' : 'ltr', setLang, t, formatDate };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
