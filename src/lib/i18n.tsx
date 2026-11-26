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
  'dash.students': 'Students and progress',
  'dash.inbox.pending': (v: Vars) =>
    num(v) === 0
      ? 'Forward posts from your channel to the bot to turn them into lessons'
      : `${enPlural(num(v), 'message', 'messages')} waiting to be imported`,

  // course students (creator)
  'students.title': 'Students',
  'students.loading': 'Loading students...',
  'students.loadFailed': 'Failed to load students',
  'students.tab.students': 'Students',
  'students.tab.lessons': 'Lessons',
  'students.stat.total': 'Students',
  'students.stat.active': 'Active this week',
  'students.stat.completed': 'Finished',
  'students.filter.all': 'All',
  'students.filter.inactive': 'Inactive',
  'students.filter.completed': 'Finished',
  'students.inactiveHint': 'No activity for {days}+ days.',
  'students.remindAll': (v: Vars) => `Remind all (${num(v)})`,
  'students.remindingProgress': 'Sending {done}/{total}...',
  'students.remindAllDone': (v: Vars) => `Sent ${enPlural(num(v), 'reminder', 'reminders')}.`,
  'students.remindAllNone': 'Everyone here was already reminded in the last 24 hours.',
  'students.confirmRemindAll': (v: Vars) => `Send a reminder to ${enPlural(num(v), 'student', 'students')}?`,
  'students.remind': 'Remind',
  'students.reminded': 'Reminded',
  'students.remindedRecently': 'Reminded today',
  'students.remindFailed': "Couldn't send",
  'students.lastActive': 'Active {when}',
  'students.currentLesson': 'At: {title}',
  'students.finished': 'Finished the course',
  'students.empty.title': 'No students yet',
  'students.empty.desc': 'Share the course link so students can enroll.',
  'students.emptyFilter': 'No students in this list.',
  'students.lessonsHint': 'How many students finished each lesson. A big drop between two lessons shows where students stop.',
  'students.dropBadge': 'Many stop here',
  'students.ofStudents': '{done} of {total}',

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
  'inbox.importAll': (v: Vars) => `Import all to this module (${num(v)})`,
  'inbox.importingProgress': 'Importing {done}/{total}...',
  'inbox.confirmImportAll': (v: Vars) =>
    `Import ${enPlural(num(v), 'message', 'messages')} as lessons into "${v.module}", in the order they were sent?`,

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
  'lessonMedia.hintProtected': 'The file will arrive in your chat with the bot to watch or open there. This course doesn\'t allow forwarding or saving.',
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
  'courses.searchPh': 'Search courses...',
  'courses.noResults': 'No courses match "{q}"',
  'courses.clearSearch': 'Clear search',

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
  'course.start': 'Start the course',
  'course.continue': 'Continue:',
  'course.finished': 'You finished this course 🎉',
  'course.reviewFromStart': 'Review from the start',
  'course.certificate': 'Get your certificate',
  'course.takeQuiz': 'Quiz:',
  'course.moduleLocked': 'Locked: pass the previous module quiz',
  'course.quizInfo': (v: Vars) => `${enPlural(num(v), 'question', 'questions')} · pass at ${v.pass}%`,
  'course.quizPassed': 'Passed ✓ · best {score}/{total}',
  'course.quizRetry': 'Not passed yet · best {score}/{total}',

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
  'lesson.position': 'Lesson {n} of {total}',
  'lesson.openList': 'All lessons',
  'lesson.nextPrefix': 'Next:',
  'lesson.list.title': 'Course lessons',
  'lesson.list.progress': '{done} of {total} completed',
  'lesson.list.current': 'Current',
  'lesson.lockedTitle': 'This lesson is locked',
  'lesson.lockedBody': 'Pass the previous module quiz to open it.',

  // course completion
  'complete.title': 'Well done! 🎉',
  'complete.bodyBefore': 'You finished',
  'complete.bodyAfter': '.',
  'complete.lessons': (v: Vars) => `${enPlural(num(v), 'lesson', 'lessons')} completed`,
  'complete.share': 'Share your achievement',
  'complete.shareText': 'I just finished the course "{course}" 🎉',
  'complete.backToCourse': 'Back to the course',
  'complete.getCertificate': 'Get your certificate',

  // quizzes (student)
  'quiz.title': 'Module quiz',
  'quiz.notFound': 'This quiz is not available.',
  'quiz.loadFailed': 'Failed to load the quiz',
  'quiz.submitFailed': 'Failed to submit your answers',
  'quiz.intro': (v: Vars) => `${enPlural(num(v), 'question', 'questions')}. Pass mark: ${v.pass}%.`,
  'quiz.previousBest': 'Your best so far: {score}/{total}',
  'quiz.alreadyPassed': 'already passed',
  'quiz.questionN': 'Question {n} of {total}',
  'quiz.answeredCount': 'Answered {done} of {total}',
  'quiz.submit': 'Submit answers',
  'quiz.submitting': 'Checking...',
  'quiz.passed': 'You passed! 🎉',
  'quiz.failed': 'Not passed yet: you need {pass}%. Review the answers and try again.',
  'quiz.retry': 'Try again',
  'quiz.takeModuleQuiz': 'Take the module quiz',

  // flashcards (student)
  'cards.title': 'Flashcards',
  'cards.loadFailed': 'Failed to load the cards',
  'cards.wholeCourse': 'Whole course',
  'cards.saveFailed': "Some answers couldn't be saved. Check your connection.",
  'cards.progress': 'Card {n} of {total}',
  'cards.front': 'Front',
  'cards.back': 'Back',
  'cards.tapToFlip': 'Tap to flip',
  'cards.flip': 'Flip the card',
  'cards.showFront': 'Show the front',
  'cards.showAnswer': 'Show answer',
  'cards.knew': 'I knew it',
  'cards.didntKnow': "I didn't know",
  'cards.doneTitle': 'Session complete!',
  'cards.doneStats': 'Knew {known} · to practise again {unknown}',
  'cards.nothingDue': 'Nothing to review right now',
  'cards.noCards': 'No cards here yet',
  'cards.nextDue': 'Next review {when}',
  'cards.practiceAll': (v: Vars) => `Practise all ${enPlural(num(v), 'card', 'cards')} anyway`,
  'cards.reviewDue': (v: Vars) => `Review flashcards (${num(v)} due)`,
  'cards.reviewAll': 'Review flashcards',
  'cards.moduleInfo': (v: Vars) => `${enPlural(Number(v.total ?? 0), 'card', 'cards')} · ${v.due} due · ${v.learned} learned`,

  // certificates
  'cert.title': 'Certificate',
  'cert.loadFailed': 'Failed to load the certificate',
  'cert.issueTitle': 'Get your certificate',
  'cert.nameLabel': 'Name on the certificate',
  'cert.nameHint': 'Write your name as you want it to appear. It can\'t be changed later.',
  'cert.issue': 'Issue my certificate',
  'cert.issuing': 'Issuing...',
  'cert.err.lessons': 'Complete every lesson of the course first.',
  'cert.err.quizzes': 'Pass every module quiz first.',
  'cert.err.name': 'The name must be 2 to 80 characters.',
  'cert.err.enroll': 'You are not enrolled in this course.',
  'cert.err.other': 'Couldn\'t issue the certificate. Please try again.',
  'cert.code': 'Verification code',
  'cert.codeHint': 'Anyone can check this certificate with this code or the verify button.',
  'cert.send': 'Send to my Telegram chat',
  'cert.sent': 'Sent to your chat with the bot',
  'cert.sendFailed': 'Couldn\'t send the certificate. Please try again.',
  'cert.share': 'Share the verification link',
  'cert.shareText': 'My certificate for "{course}" (code {code})',
  'cert.verifyTitle': 'Verify certificate',
  'cert.verifyFailed': 'Couldn\'t check the certificate',
  'cert.valid': 'Valid certificate',
  'cert.invalid': 'Certificate not found',
  'cert.invalidBody': 'No certificate matches this code. Check the code and try again.',
  'cert.field.student': 'Student',
  'cert.field.course': 'Course',
  'cert.field.teacher': 'Teacher',
  'cert.field.lessons': 'Lessons',
  'cert.field.date': 'Issued on',

  // profile
  'profile.role.student': 'Student',
  'profile.role.creator': 'Creator',
  'profile.switchToCreator': 'Switch to Creator mode',
  'profile.switchToStudent': 'Switch to Student mode',
  'profile.creatorHint': 'Create and manage courses',
  'profile.studentHint': 'Browse and learn from courses',
  'profile.language': 'Language',
  'profile.appearance': 'Appearance',
  'profile.theme.auto': 'Auto',
  'profile.theme.light': 'Light',
  'profile.theme.dark': 'Dark',
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
  'editor.protectFailed': 'Failed to update content protection',
  'editor.gatingFailed': 'Failed to update the quiz setting',
  'editor.gating.title': 'Require passing module quizzes',
  'editor.gating.on': 'A module opens only after the previous module quizzes are passed.',
  'editor.gating.off': 'Students move freely; quizzes count toward the certificate.',
  'editor.moduleQuiz': 'Module quiz',
  'editor.flashcards': 'Flashcards',

  // flashcard editor
  'cardEditor.title': 'Flashcards',
  'cardEditor.loadFailed': 'Failed to load the cards',
  'cardEditor.add': 'Add card',
  'cardEditor.bulk': 'Paste a list',
  'cardEditor.edit': 'Edit card',
  'cardEditor.front': 'Front (question or term)',
  'cardEditor.frontPh': 'e.g. apple',
  'cardEditor.back': 'Back (answer or definition)',
  'cardEditor.backPh': 'e.g. تفاحة',
  'cardEditor.save': 'Save card',
  'cardEditor.err.both': 'Fill in both sides of the card.',
  'cardEditor.confirmDelete': 'Delete this card?',
  'cardEditor.count': (v: Vars) => enPlural(num(v), 'card', 'cards'),
  'cardEditor.empty.title': 'No cards yet',
  'cardEditor.empty.desc': 'Cards help students memorize terms, words and key facts with spaced review.',
  'cardEditor.bulkTitle': 'Paste many cards',
  'cardEditor.bulkHint': 'One card per line: front | back. Two columns copied from a spreadsheet also work.',
  'cardEditor.bulkReady': (v: Vars) => `${enPlural(num(v), 'card', 'cards')} ready.`,
  'cardEditor.bulkBad': 'Skipped lines: {lines}',
  'cardEditor.bulkSave': (v: Vars) => `Add ${enPlural(num(v), 'card', 'cards')}`,
  'editor.noQuiz': 'None yet',
  'editor.quizQuestions': (v: Vars) => enPlural(num(v), 'question', 'questions'),

  // quiz editor
  'quizEditor.title': 'Module quiz',
  'quizEditor.loadFailed': 'Failed to load the quiz',
  'quizEditor.hint': 'Students see only the questions. Correct answers stay on the server and are checked there.',
  'quizEditor.passMark': 'Pass mark',
  'quizEditor.passMarkHint': 'Minimum score to pass this quiz.',
  'quizEditor.empty.title': 'No questions yet',
  'quizEditor.empty.desc': 'Add a few multiple-choice questions to check understanding of this module.',
  'quizEditor.addQuestion': 'Add question',
  'quizEditor.editQuestion': 'Edit question',
  'quizEditor.confirmDelete': 'Delete this question?',
  'quizEditor.question': 'Question',
  'quizEditor.questionPh': 'e.g. Which keyword defines a function in Python?',
  'quizEditor.options': 'Answers',
  'quizEditor.optionsHint': 'Tap the circle next to the correct answer.',
  'quizEditor.correctLabel': 'Correct answer',
  'quizEditor.markCorrect': 'Mark answer {n} as correct',
  'quizEditor.optionPh': 'Answer {n}',
  'quizEditor.addOption': 'Add answer',
  'quizEditor.explanation': 'Explanation (optional)',
  'quizEditor.explanationPh': 'Shown to students after they submit',
  'quizEditor.saveQuestion': 'Save question',
  'quizEditor.err.question': 'Write the question.',
  'quizEditor.err.emptyOption': 'Fill in every answer or remove the empty ones.',
  'quizEditor.err.duplicate': 'Two answers are the same.',
  'quizEditor.err.correct': 'Choose the correct answer.',
  'quizEditor.err.save': 'Failed to save',
  'quizEditor.err.delete': 'Failed to delete the question',
  'editor.protect.title': 'Prevent saving and forwarding',
  'editor.protect.on': 'Students can watch and open files, but not forward or save them.',
  'editor.protect.off': 'Students can forward and save the files they receive.',
  'editor.protect.note': 'Videos and images are fully protected. On Android, Telegram still lets students save PDFs and audio.',
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
  'dash.students': 'الطلاب والتقدّم',
  'dash.inbox.pending': (v) =>
    arPlural(num(v), {
      zero: 'أعد توجيه منشورات قناتك إلى البوت لتحويلها إلى دروس',
      one: 'رسالة واحدة بانتظار الاستيراد',
      two: 'رسالتان بانتظار الاستيراد',
      few: '{n} رسائل بانتظار الاستيراد',
      many: '{n} رسالة بانتظار الاستيراد',
      other: '{n} رسالة بانتظار الاستيراد',
    }),

  'students.title': 'الطلاب',
  'students.loading': 'جارٍ تحميل الطلاب...',
  'students.loadFailed': 'تعذّر تحميل الطلاب',
  'students.tab.students': 'الطلاب',
  'students.tab.lessons': 'الدروس',
  'students.stat.total': 'الطلاب',
  'students.stat.active': 'نشطون هذا الأسبوع',
  'students.stat.completed': 'أنهوا الدورة',
  'students.filter.all': 'الكل',
  'students.filter.inactive': 'غير نشطين',
  'students.filter.completed': 'أنهوا الدورة',
  'students.inactiveHint': 'لا نشاط منذ {days} أيام أو أكثر.',
  'students.remindAll': (v) => `تذكير الكل (${num(v)})`,
  'students.remindingProgress': 'جارٍ الإرسال {done}/{total}...',
  'students.remindAllDone': (v) =>
    arPlural(num(v), { zero: 'لم يُرسل أي تذكير.', one: 'أُرسل تذكير واحد.', two: 'أُرسل تذكيران.', few: 'أُرسلت {n} تذكيرات.', many: 'أُرسل {n} تذكيرًا.', other: 'أُرسل {n} تذكير.' }),
  'students.remindAllNone': 'كل من في هذه القائمة ذُكّر خلال آخر 24 ساعة.',
  'students.confirmRemindAll': (v) =>
    arPlural(num(v), { zero: 'لا يوجد طلاب للتذكير.', one: 'إرسال تذكير إلى طالب واحد؟', two: 'إرسال تذكير إلى طالبين؟', few: 'إرسال تذكير إلى {n} طلاب؟', many: 'إرسال تذكير إلى {n} طالبًا؟', other: 'إرسال تذكير إلى {n} طالب؟' }),
  'students.remind': 'تذكير',
  'students.reminded': 'تم التذكير',
  'students.remindedRecently': 'ذُكّر اليوم',
  'students.remindFailed': 'تعذّر الإرسال',
  'students.lastActive': 'نشط {when}',
  'students.currentLesson': 'عند: {title}',
  'students.finished': 'أنهى الدورة',
  'students.empty.title': 'لا يوجد طلاب بعد',
  'students.empty.desc': 'شارك رابط الدورة ليبدأ الطلاب بالتسجيل.',
  'students.emptyFilter': 'لا يوجد طلاب في هذه القائمة.',
  'students.lessonsHint': 'عدد الطلاب الذين أنهوا كل درس. الانخفاض الكبير بين درسين يعني أن الطلاب يتوقفون هناك.',
  'students.dropBadge': 'يتوقف عنده كثيرون',
  'students.ofStudents': '{done} من {total}',

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
  'inbox.importAll': (v) => `استيراد الكل إلى هذه الوحدة (${num(v)})`,
  'inbox.importingProgress': 'جارٍ الاستيراد {done}/{total}...',
  'inbox.confirmImportAll': (v) =>
    arPlural(num(v), {
      zero: '', one: 'استيراد رسالة واحدة', two: 'استيراد رسالتين', few: 'استيراد {n} رسائل', many: 'استيراد {n} رسالة', other: 'استيراد {n} رسالة',
    }) + ` كدروس في وحدة «${v.module}» بنفس ترتيب إرسالها؟`,

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
  'lessonMedia.hintProtected': 'سيصلك الملف في محادثتك مع البوت لتشاهده أو تفتحه هناك. هذه الدورة لا تسمح بإعادة التوجيه أو الحفظ.',
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
  'courses.searchPh': 'ابحث في الدورات...',
  'courses.noResults': 'لا توجد دورات تطابق «{q}»',
  'courses.clearSearch': 'مسح البحث',

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
  'course.start': 'ابدأ الدورة',
  'course.continue': 'متابعة:',
  'course.finished': 'أنهيت هذه الدورة 🎉',
  'course.reviewFromStart': 'المراجعة من البداية',
  'course.certificate': 'احصل على شهادتك',
  'course.takeQuiz': 'اختبار:',
  'course.moduleLocked': 'مقفلة: انجح في اختبار الوحدة السابقة',
  'course.quizInfo': (v) =>
    arPlural(num(v), { zero: 'لا أسئلة', one: 'سؤال واحد', two: 'سؤالان', few: '{n} أسئلة', many: '{n} سؤالًا', other: '{n} سؤال' }) +
    ` · النجاح من ${v.pass}%`,
  'course.quizPassed': 'ناجح ✓ · أفضل نتيجة {score}/{total}',
  'course.quizRetry': 'لم تنجح بعد · أفضل نتيجة {score}/{total}',

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
  'lesson.position': 'الدرس {n} من {total}',
  'lesson.openList': 'كل الدروس',
  'lesson.nextPrefix': 'التالي:',
  'lesson.list.title': 'دروس الدورة',
  'lesson.list.progress': 'أنجزت {done} من {total}',
  'lesson.list.current': 'الحالي',
  'lesson.lockedTitle': 'هذا الدرس مقفل',
  'lesson.lockedBody': 'انجح في اختبار الوحدة السابقة لفتحه.',

  'complete.title': 'أحسنت! 🎉',
  'complete.bodyBefore': 'أنهيت دورة',
  'complete.bodyAfter': 'كاملة.',
  'complete.lessons': (v) =>
    arPlural(num(v), { zero: 'لا دروس', one: 'درس واحد مكتمل', two: 'درسان مكتملان', few: '{n} دروس مكتملة', many: '{n} درسًا مكتملًا', other: '{n} درس مكتمل' }),
  'complete.share': 'شارك إنجازك',
  'complete.shareText': 'أنهيت دورة «{course}» 🎉',
  'complete.backToCourse': 'العودة إلى الدورة',
  'complete.getCertificate': 'احصل على شهادتك',

  'quiz.title': 'اختبار الوحدة',
  'quiz.notFound': 'هذا الاختبار غير متاح.',
  'quiz.loadFailed': 'تعذّر تحميل الاختبار',
  'quiz.submitFailed': 'تعذّر إرسال إجاباتك',
  'quiz.intro': (v) =>
    arPlural(num(v), { zero: 'لا أسئلة', one: 'سؤال واحد', two: 'سؤالان', few: '{n} أسئلة', many: '{n} سؤالًا', other: '{n} سؤال' }) +
    `. درجة النجاح: ${v.pass}%.`,
  'quiz.previousBest': 'أفضل نتيجة لك: {score}/{total}',
  'quiz.alreadyPassed': 'ناجح',
  'quiz.questionN': 'السؤال {n} من {total}',
  'quiz.answeredCount': 'أجبت على {done} من {total}',
  'quiz.submit': 'تسليم الإجابات',
  'quiz.submitting': 'جارٍ التصحيح...',
  'quiz.passed': 'نجحت! 🎉',
  'quiz.failed': 'لم تنجح بعد: تحتاج {pass}%. راجع الإجابات وحاول مرة أخرى.',
  'quiz.retry': 'إعادة المحاولة',
  'quiz.takeModuleQuiz': 'اختبار الوحدة',

  'cards.title': 'بطاقات المراجعة',
  'cards.loadFailed': 'تعذّر تحميل البطاقات',
  'cards.wholeCourse': 'الدورة كاملة',
  'cards.saveFailed': 'تعذّر حفظ بعض الإجابات. تحقق من الاتصال.',
  'cards.progress': 'البطاقة {n} من {total}',
  'cards.front': 'الوجه',
  'cards.back': 'الظهر',
  'cards.tapToFlip': 'اضغط لقلب البطاقة',
  'cards.flip': 'اقلب البطاقة',
  'cards.showFront': 'أظهر الوجه',
  'cards.showAnswer': 'أظهر الإجابة',
  'cards.knew': 'عرفتها',
  'cards.didntKnow': 'لم أعرفها',
  'cards.doneTitle': 'انتهت الجلسة!',
  'cards.doneStats': 'عرفت {known} · للمراجعة مجدداً {unknown}',
  'cards.nothingDue': 'لا توجد بطاقات مستحقة الآن',
  'cards.noCards': 'لا توجد بطاقات هنا بعد',
  'cards.nextDue': 'المراجعة القادمة {when}',
  'cards.practiceAll': (v) =>
    'تدرّب على ' +
    arPlural(num(v), { zero: 'كل البطاقات', one: 'البطاقة', two: 'البطاقتين', few: 'كل البطاقات ({n})', many: 'كل البطاقات ({n})', other: 'كل البطاقات ({n})' }) +
    ' على أي حال',
  'cards.reviewDue': 'مراجعة البطاقات ({n} مستحقة)',
  'cards.reviewAll': 'مراجعة البطاقات',
  'cards.moduleInfo': (v) =>
    arPlural(Number(v.total ?? 0), { zero: 'لا بطاقات', one: 'بطاقة واحدة', two: 'بطاقتان', few: '{n} بطاقات', many: '{n} بطاقة', other: '{n} بطاقة' }) +
    ` · ${v.due} مستحقة · ${v.learned} محفوظة`,

  'cert.title': 'الشهادة',
  'cert.loadFailed': 'تعذّر تحميل الشهادة',
  'cert.issueTitle': 'احصل على شهادتك',
  'cert.nameLabel': 'الاسم على الشهادة',
  'cert.nameHint': 'اكتب اسمك كما تريده أن يظهر. لا يمكن تغييره لاحقاً.',
  'cert.issue': 'إصدار شهادتي',
  'cert.issuing': 'جارٍ الإصدار...',
  'cert.err.lessons': 'أكمل كل دروس الدورة أولاً.',
  'cert.err.quizzes': 'انجح في كل اختبارات الوحدات أولاً.',
  'cert.err.name': 'يجب أن يكون الاسم بين 2 و80 حرفاً.',
  'cert.err.enroll': 'أنت غير مسجّل في هذه الدورة.',
  'cert.err.other': 'تعذّر إصدار الشهادة. حاول مرة أخرى.',
  'cert.code': 'رمز التحقق',
  'cert.codeHint': 'يستطيع أي شخص التحقق من هذه الشهادة بهذا الرمز أو بزر التحقق.',
  'cert.send': 'إرسال إلى محادثتي في تيليغرام',
  'cert.sent': 'أُرسلت إلى محادثتك مع البوت',
  'cert.sendFailed': 'تعذّر إرسال الشهادة. حاول مرة أخرى.',
  'cert.share': 'مشاركة رابط التحقق',
  'cert.shareText': 'شهادتي في دورة «{course}» (رمز {code})',
  'cert.verifyTitle': 'التحقق من شهادة',
  'cert.verifyFailed': 'تعذّر التحقق من الشهادة',
  'cert.valid': 'شهادة صحيحة',
  'cert.invalid': 'الشهادة غير موجودة',
  'cert.invalidBody': 'لا توجد شهادة بهذا الرمز. تأكد من الرمز وحاول مرة أخرى.',
  'cert.field.student': 'الطالب',
  'cert.field.course': 'الدورة',
  'cert.field.teacher': 'المدرّس',
  'cert.field.lessons': 'عدد الدروس',
  'cert.field.date': 'تاريخ الإصدار',

  'profile.role.student': 'طالب',
  'profile.role.creator': 'صانع محتوى',
  'profile.switchToCreator': 'التحويل إلى وضع صانع المحتوى',
  'profile.switchToStudent': 'التحويل إلى وضع الطالب',
  'profile.creatorHint': 'أنشئ دوراتك وأدِرها',
  'profile.studentHint': 'تصفّح الدورات وتعلّم منها',
  'profile.language': 'اللغة',
  'profile.appearance': 'المظهر',
  'profile.theme.auto': 'تلقائي',
  'profile.theme.light': 'فاتح',
  'profile.theme.dark': 'داكن',
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
  'editor.protectFailed': 'تعذّر تغيير إعداد الحماية',
  'editor.gatingFailed': 'تعذّر تغيير إعداد الاختبارات',
  'editor.gating.title': 'اشتراط النجاح في اختبارات الوحدات',
  'editor.gating.on': 'لا تُفتح الوحدة إلا بعد النجاح في اختبارات الوحدات السابقة.',
  'editor.gating.off': 'يتنقل الطلاب بحرية، والاختبارات تُحتسب للشهادة.',
  'editor.moduleQuiz': 'اختبار الوحدة',
  'editor.flashcards': 'بطاقات المراجعة',

  'cardEditor.title': 'بطاقات المراجعة',
  'cardEditor.loadFailed': 'تعذّر تحميل البطاقات',
  'cardEditor.add': 'إضافة بطاقة',
  'cardEditor.bulk': 'لصق قائمة',
  'cardEditor.edit': 'تعديل البطاقة',
  'cardEditor.front': 'الوجه (سؤال أو مصطلح)',
  'cardEditor.frontPh': 'مثال: apple',
  'cardEditor.back': 'الظهر (الإجابة أو التعريف)',
  'cardEditor.backPh': 'مثال: تفاحة',
  'cardEditor.save': 'حفظ البطاقة',
  'cardEditor.err.both': 'املأ وجهي البطاقة.',
  'cardEditor.confirmDelete': 'حذف هذه البطاقة؟',
  'cardEditor.count': (v) =>
    arPlural(num(v), { zero: 'لا بطاقات', one: 'بطاقة واحدة', two: 'بطاقتان', few: '{n} بطاقات', many: '{n} بطاقة', other: '{n} بطاقة' }),
  'cardEditor.empty.title': 'لا توجد بطاقات بعد',
  'cardEditor.empty.desc': 'البطاقات تساعد الطلاب على حفظ المصطلحات والكلمات والمعلومات الأساسية بمراجعة متباعدة.',
  'cardEditor.bulkTitle': 'لصق عدة بطاقات',
  'cardEditor.bulkHint': 'بطاقة في كل سطر: الوجه | الظهر. ويمكنك أيضاً نسخ عمودين من جدول Excel.',
  'cardEditor.bulkReady': (v) =>
    arPlural(num(v), { zero: 'لا توجد بطاقات جاهزة.', one: 'بطاقة واحدة جاهزة.', two: 'بطاقتان جاهزتان.', few: '{n} بطاقات جاهزة.', many: '{n} بطاقة جاهزة.', other: '{n} بطاقة جاهزة.' }),
  'cardEditor.bulkBad': 'أسطر لم تُقرأ: {lines}',
  'cardEditor.bulkSave': (v) =>
    arPlural(num(v), { zero: 'إضافة', one: 'إضافة بطاقة واحدة', two: 'إضافة بطاقتين', few: 'إضافة {n} بطاقات', many: 'إضافة {n} بطاقة', other: 'إضافة {n} بطاقة' }),
  'editor.noQuiz': 'لا يوجد بعد',
  'editor.quizQuestions': (v) =>
    arPlural(num(v), { zero: 'لا أسئلة', one: 'سؤال واحد', two: 'سؤالان', few: '{n} أسئلة', many: '{n} سؤالًا', other: '{n} سؤال' }),

  'quizEditor.title': 'اختبار الوحدة',
  'quizEditor.loadFailed': 'تعذّر تحميل الاختبار',
  'quizEditor.hint': 'يرى الطلاب الأسئلة فقط. الإجابات الصحيحة تبقى في الخادم ويتم التصحيح هناك.',
  'quizEditor.passMark': 'درجة النجاح',
  'quizEditor.passMarkHint': 'أقل نسبة للنجاح في هذا الاختبار.',
  'quizEditor.empty.title': 'لا توجد أسئلة بعد',
  'quizEditor.empty.desc': 'أضف بعض أسئلة الاختيار من متعدد للتأكد من فهم هذه الوحدة.',
  'quizEditor.addQuestion': 'إضافة سؤال',
  'quizEditor.editQuestion': 'تعديل السؤال',
  'quizEditor.confirmDelete': 'حذف هذا السؤال؟',
  'quizEditor.question': 'السؤال',
  'quizEditor.questionPh': 'مثال: ما الكلمة التي تعرّف دالة في بايثون؟',
  'quizEditor.options': 'الإجابات',
  'quizEditor.optionsHint': 'اضغط الدائرة بجانب الإجابة الصحيحة.',
  'quizEditor.correctLabel': 'الإجابة الصحيحة',
  'quizEditor.markCorrect': 'تحديد الإجابة {n} كصحيحة',
  'quizEditor.optionPh': 'الإجابة {n}',
  'quizEditor.addOption': 'إضافة إجابة',
  'quizEditor.explanation': 'شرح الإجابة (اختياري)',
  'quizEditor.explanationPh': 'يظهر للطالب بعد التسليم',
  'quizEditor.saveQuestion': 'حفظ السؤال',
  'quizEditor.err.question': 'اكتب السؤال.',
  'quizEditor.err.emptyOption': 'املأ كل الإجابات أو احذف الفارغة.',
  'quizEditor.err.duplicate': 'هناك إجابتان متطابقتان.',
  'quizEditor.err.correct': 'اختر الإجابة الصحيحة.',
  'quizEditor.err.save': 'تعذّر الحفظ',
  'quizEditor.err.delete': 'تعذّر حذف السؤال',
  'editor.protect.title': 'منع الحفظ وإعادة التوجيه',
  'editor.protect.on': 'يستطيع الطلاب مشاهدة الملفات وفتحها، دون إعادة توجيهها أو حفظها.',
  'editor.protect.off': 'يستطيع الطلاب إعادة توجيه الملفات التي تصلهم وحفظها.',
  'editor.protect.note': 'الفيديو والصور محميّة بالكامل. في أندرويد ما زال تيليغرام يسمح بحفظ ملفات PDF والصوت.',
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
  /** "3 days ago", "yesterday", "منذ 3 أيام", "أمس" */
  formatRelative: (iso: string) => string;
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
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const formatRelative = (iso: string) => {
      const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
      const abs = Math.abs(seconds);
      if (abs < 60) return rtf.format(0, 'second');
      if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
      if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
      if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), 'day');
      if (abs < 86400 * 365) return rtf.format(Math.round(seconds / (86400 * 30)), 'month');
      return rtf.format(Math.round(seconds / (86400 * 365)), 'year');
    };
    return { lang, dir: lang === 'ar' ? 'rtl' : 'ltr', setLang, t, formatDate, formatRelative };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
