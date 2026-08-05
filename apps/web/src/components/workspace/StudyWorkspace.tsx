import { useState, useCallback } from "react";

import { LeftSidebar } from "./workspace/LeftSidebar";
import { TopBar } from "./workspace/TopBar";
import { LessonContent } from "./workspace/LessonContent";
import { AIMentor } from "./workspace/AIMentor";
import { FlashcardDrawer } from "./workspace/FlashcardDrawer";
import { ActionBar } from "./workspace/ActionBar";

// Realistic pharmacy course data
const courseData = {
  title: "Cardiovascular Pharmacology",
  professor: "Dr. Patricia Chen",
  examDate: "Dec 18, 2024",
  remainingDays: 12,
  totalLessons: 8,
  completedLessons: 3,
  studyStreak: 7,
};

export interface Lesson {
  id: number;
  title: string;
  status: "completed" | "current" | "upcoming";
  duration: string;
}

const lessons: Lesson[] = [
  {
    id: 1,
    title: "Introduction to CV System",
    status: "completed",
    duration: "15 min",
  },
  {
    id: 2,
    title: "Antihypertensives Overview",
    status: "completed",
    duration: "25 min",
  },
  { id: 3, title: "Beta-Blockers", status: "completed", duration: "30 min" },
  {
    id: 4,
    title: "ACE Inhibitors & ARBs",
    status: "current",
    duration: "35 min",
  },
  {
    id: 5,
    title: "Calcium Channel Blockers",
    status: "upcoming",
    duration: "30 min",
  },
  { id: 6, title: "Diuretics", status: "upcoming", duration: "28 min" },
  { id: 7, title: "Antiarrhythmics", status: "upcoming", duration: "32 min" },
  {
    id: 8,
    title: "Heart Failure Treatment",
    status: "upcoming",
    duration: "40 min",
  },
];

interface StudyWorkspaceProps {
  isDark: boolean;
  onToggleDark: () => void;
  onStartQuiz: () => void;
  onStartFlashcards: () => void;
}

export function StudyWorkspace({
  isDark,
  onToggleDark,
  onStartQuiz,
  onStartFlashcards,
}: StudyWorkspaceProps) {
  const [currentLessonId, setCurrentLessonId] = useState(4);
  const [flashcardOpen, setFlashcardOpen] = useState(false);

  const currentLesson = lessons.find((l) => l.id === currentLessonId)!;

  const handlePrevLesson = useCallback(() => {
    setCurrentLessonId((prev) => Math.max(1, prev - 1));
  }, []);

  const handleNextLesson = useCallback(() => {
    setCurrentLessonId((prev) => Math.min(lessons.length, prev + 1));
  }, []);

  return (
    <div
      className={`h-screen flex flex-col overflow-hidden bg-[var(--color-background)] ${isDark ? "dark" : ""}`}
    >
      {/* Top Bar */}
      <TopBar
        isDark={isDark}
        onToggleDark={onToggleDark}
        courseData={courseData}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <LeftSidebar
          courseData={courseData}
          lessons={lessons}
          currentLessonId={currentLessonId}
          onSelectLesson={setCurrentLessonId}
        />

        {/* Center Content - Reading Experience */}
        <main className="flex-1 overflow-y-auto">
          <LessonContent
            lesson={currentLesson}
            totalLessons={lessons.length}
            onPrevLesson={handlePrevLesson}
            canGoPrev={currentLessonId > 1}
            canGoNext={currentLessonId < lessons.length}
            onCompleteLesson={() => {
              if (currentLessonId < lessons.length) {
                handleNextLesson();
              }
            }}
          />
        </main>

        {/* Right Sidebar - AI Mentor */}
        <AIMentor lessonTitle={currentLesson.title} />
      </div>

      {/* Sticky Action Bar */}
      <ActionBar
        flashcardOpen={flashcardOpen}
        onToggleFlashcards={() => setFlashcardOpen(!flashcardOpen)}
        onStartQuiz={onStartQuiz}
        onQuickReview={onStartFlashcards}
      />

      {/* Flashcard Drawer (Bottom Sheet) */}
      <FlashcardDrawer
        isOpen={flashcardOpen}
        onClose={() => setFlashcardOpen(false)}
        lessonTitle={currentLesson.title}
      />
    </div>
  );
}
