import { motion } from "framer-motion";
import {
  Clock,
  CheckCircle2,
  ChevronRight,
  BookOpen,
  Bookmark,
  FileText,
  Download,
  Calendar,
  Award,
} from "lucide-react";

interface Lesson {
  id: number;
  title: string;
  status: "completed" | "current" | "upcoming";
  duration: string;
}

interface LeftSidebarProps {
  courseData: {
    title: string;
    professor: string;
    examDate: string;
    remainingDays: number;
    totalLessons: number;
    completedLessons: number;
    studyStreak: number;
  };
  lessons: Lesson[];
  currentLessonId: number;
  onSelectLesson: (id: number) => void;
}

export function LeftSidebar({
  courseData,
  lessons,
  currentLessonId,
  onSelectLesson,
}: LeftSidebarProps) {
  const progressPercent = Math.round(
    (courseData.completedLessons / courseData.totalLessons) * 100,
  );

  return (
    <aside className="w-[280px] flex-shrink-0 bg-[var(--color-surface)] border-r border-[var(--color-border)] overflow-y-auto">
      <div className="p-5 space-y-6">
        {/* Course Info */}
        <div className="space-y-3">
          <h2 className="font-bold text-lg leading-tight">
            {courseData.title}
          </h2>
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <Calendar className="w-4 h-4" />
            <span>{courseData.professor}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>Exam: {courseData.examDate}</span>
            <span
              className={`px-2 py-0.5 rounded-full font-medium ${
                courseData.remainingDays <= 7
                  ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                  : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400"
              }`}
            >
              {courseData.remainingDays} days left
            </span>
          </div>

          {/* Overall Progress */}
          <div className="pt-2 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--color-text-muted)]">
                Overall Progress
              </span>
              <span className="font-semibold">{progressPercent}%</span>
            </div>
            <div className="h-2 bg-[var(--color-background)] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <Award className="w-3.5 h-3.5" />
              <span>
                {courseData.completedLessons} of {courseData.totalLessons}{" "}
                lessons complete
              </span>
            </div>
          </div>

          {/* Today's Goal */}
          <div className="mt-4 p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-200/50 dark:border-indigo-800/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                Today's Goal
              </span>
              <Clock className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
              Complete 2 Lessons
            </p>
            <p className="text-xs text-indigo-500/70 dark:text-indigo-400/60 mt-1">
              ~45 min estimated
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--color-border)]" />

        {/* Study Plan */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Study Plan
            </h3>
            <BookOpen className="w-4 h-4 text-[var(--color-text-muted)]" />
          </div>

          <div className="space-y-1">
            {lessons.map((lesson, index) => (
              <motion.button
                key={lesson.id}
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => onSelectLesson(lesson.id)}
                className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${
                  lesson.id === currentLessonId
                    ? "bg-indigo-50 dark:bg-indigo-950/40 ring-1 ring-indigo-200 dark:ring-indigo-800"
                    : lesson.status === "completed"
                      ? "hover:bg-[var(--color-background)]"
                      : "hover:bg-[var(--color-background)] opacity-60"
                }`}
              >
                {/* Status Icon */}
                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    lesson.status === "completed"
                      ? "bg-emerald-100 dark:bg-emerald-900/30"
                      : lesson.status === "current"
                        ? "bg-gradient-to-br from-indigo-500 to-purple-500"
                        : "bg-[var(--color-background)]"
                  }`}
                >
                  {lesson.status === "completed" ? (
                    <CheckCircle2
                      className="w-4 h-4 text-emerald-600 dark:text-emerald-400"
                      strokeWidth={2.5}
                    />
                  ) : lesson.status === "current" ? (
                    <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  ) : (
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">
                      {index + 1}
                    </span>
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${
                      lesson.id === currentLessonId
                        ? "text-indigo-600 dark:text-indigo-400"
                        : ""
                    }`}
                  >
                    {lesson.title}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {lesson.duration}
                  </p>
                </div>

                {lesson.id === currentLessonId && (
                  <ChevronRight className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                )}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-[var(--color-border)]" />

        {/* Quick Actions */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Quick Access
          </h3>

          {[
            { icon: Bookmark, label: "Bookmarks", count: 5 },
            { icon: FileText, label: "Notes", count: 12 },
            { icon: Download, label: "Downloads", count: 8 },
          ].map((action) => (
            <button
              key={action.label}
              className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-[var(--color-background)] transition-colors group"
            >
              <div className="flex items-center gap-3">
                <action.icon className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-indigo-500 transition-colors" />
                <span className="text-sm">{action.label}</span>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-background)] text-[var(--color-text-muted)]">
                {action.count}
              </span>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
