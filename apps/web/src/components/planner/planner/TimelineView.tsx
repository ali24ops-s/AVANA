import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Layers,
  HelpCircle,
  Play,
  Clock,
  CheckCircle2,
  CalendarPlus,
  BarChart3,
} from "lucide-react";

interface Session {
  id: string;
  type: "learn" | "flashcard" | "quiz" | "review";
  title: string;
  duration: string;
  difficulty: "easy" | "medium" | "hard";
  learningGain: number;
  energyRequired: "low" | "medium" | "high";
  priority: "high" | "medium" | "low";
}

interface DayPlan {
  date: string;
  dayLabel: string;
  isToday: boolean;
  isPast: boolean;
  sessions: Session[];
  totalTime: string;
  completionRate: number;
}

// Generate realistic 14-day study plan
const generateStudyPlan = (): DayPlan[] => {
  const days: DayPlan[] = [];
  const today = new Date();

  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);

    const sessions: Session[] = [];
    let totalMinutes = 0;

    // Determine which chapters to cover based on day progression
    const chapterIndex = Math.min(Math.floor(i / 2), 7);

    if (i < 12) {
      // Learning sessions (first 6 days of content)
      if (i % 2 === 0) {
        sessions.push({
          id: `session-${i}-1`,
          type: "learn",
          title:
            [
              "Introduction & Overview",
              "Antihypertensives",
              "Beta-Blockers",
              "ACE Inhibitors & ARBs",
              "Calcium Channel Blockers",
              "Diuretics",
              "Antiarrhythmics",
              "Heart Failure",
            ][chapterIndex] || "Review",
          duration: "35 min",
          difficulty:
            chapterIndex < 3 ? "easy" : chapterIndex < 5 ? "medium" : "hard",
          learningGain: 85,
          energyRequired: chapterIndex < 4 ? "medium" : "high",
          priority: "high",
        });
        totalMinutes += 35;

        sessions.push({
          id: `session-${i}-2`,
          type: "flashcard",
          title: `${
            [
              "CV System",
              "HTN Basics",
              "Beta Blockers",
              "ACE/ARBs",
              "CCBs",
              "Diuretics",
              "Arrhythmias",
              "HF Mgmt",
            ][chapterIndex]
          } Flashcards`,
          duration: "20 min",
          difficulty: "medium",
          learningGain: 70,
          energyRequired: "low",
          priority: "high",
        });
        totalMinutes += 20;
      } else {
        sessions.push({
          id: `session-${i}-1`,
          type: "learn",
          title:
            [
              "Clinical Applications",
              "Drug Comparisons",
              "Mechanism Deep Dive",
              "Clinical Pearls",
              "Special Populations",
              "Exam Focus Topics",
            ][Math.floor(i / 2)] || "Advanced Review",
          duration: "30 min",
          difficulty: i < 8 ? "easy" : "hard",
          learningGain: 80,
          energyRequired: "medium",
          priority: "medium",
        });
        totalMinutes += 30;

        if (i > 1 && i % 4 === 1) {
          sessions.push({
            id: `session-${i}-2`,
            type: "quiz",
            title: `Quick Quiz - Chapters ${chapterIndex}-${Math.min(chapterIndex + 1, 8)}`,
            duration: "15 min",
            difficulty: "medium",
            learningGain: 90,
            energyRequired: "medium",
            priority: "medium",
          });
          totalMinutes += 15;
        }
      }

      // Add review session every few days
      if ((i + 1) % 4 === 0 && i > 1) {
        sessions.push({
          id: `session-${i}-r`,
          type: "review",
          title: "Cumulative Review Session",
          duration: "25 min",
          difficulty: "medium",
          learningGain: 75,
          energyRequired: "low",
          priority: "low",
        });
        totalMinutes += 25;
      }
    } else {
      // Final exam prep days
      sessions.push(
        {
          id: `session-${i}-1`,
          type: "review",
          title: "High-Yield Topics Review",
          duration: "40 min",
          difficulty: "hard",
          learningGain: 95,
          energyRequired: "high",
          priority: "high",
        },
        {
          id: `session-${i}-2`,
          type: "flashcard",
          title: "All Chapters Flashcards",
          duration: "25 min",
          difficulty: "hard",
          learningGain: 90,
          energyRequired: "medium",
          priority: "high",
        },
        {
          id: `session-${i}-3`,
          type: "quiz",
          title: "Practice Exam Simulation",
          duration: "45 min",
          difficulty: "hard",
          learningGain: 100,
          energyRequired: "high",
          priority: "high",
        },
      );
      totalMinutes = 110;
    }

    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    days.push({
      date: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      dayLabel:
        i === 0
          ? "TODAY"
          : i === 1
            ? "TOMORROW"
            : i <= 7
              ? `Day ${i}`
              : date.toLocaleDateString("en-US", { weekday: "short" }),
      isToday: i === 0,
      isPast: false,
      sessions,
      totalTime: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
      completionRate: i === 0 ? 50 : 0,
    });
  }

  return days;
};

const studyDays = generateStudyPlan();

interface TimelineViewProps {
  selectedDay: number;
  onSelectDay: (index: number) => void;
  completedSessions: Set<string>;
  onSessionComplete: (sessionId: string) => void;
  onViewWorkspace: () => void;
  onCompleteDay: () => void;
}

export function TimelineView({
  selectedDay,
  onSelectDay,
  completedSessions,
  onSessionComplete,
  onViewWorkspace,
  onCompleteDay,
}: TimelineViewProps) {
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const currentDay = studyDays[selectedDay];
  const dayCompletedSessions = currentDay.sessions.filter((s) =>
    completedSessions.has(s.id),
  ).length;
  const dayProgress = Math.round(
    (dayCompletedSessions / currentDay.sessions.length) * 100,
  );

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
      {/* Timeline Header */}
      <div className="p-5 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <CalendarPlus className="w-5 h-5 text-indigo-500" />
            Study Timeline
          </h2>

          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelectDay(Math.max(0, selectedDay - 1))}
              disabled={selectedDay === 0}
              className="p-2 rounded-lg hover:bg-[var(--color-background)] disabled:opacity-30"
            >
              <ChevronLeft className="w-5 h-5" />
            </motion.button>

            <span className="px-3 py-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-sm font-medium text-indigo-600 dark:text-indigo-400">
              Day {selectedDay + 1} of {studyDays.length}
            </span>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() =>
                onSelectDay(Math.min(studyDays.length - 1, selectedDay + 1))
              }
              disabled={selectedDay === studyDays.length - 1}
              className="p-2 rounded-lg hover:bg-[var(--color-background)] disabled:opacity-30"
            >
              <ChevronRight className="w-5 h-5" />
            </motion.button>
          </div>
        </div>

        {/* Day Selector Strip */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {studyDays.map((day, index) => (
            <motion.button
              key={index}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectDay(index)}
              className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-left transition-all ${
                index === selectedDay
                  ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md"
                  : index === selectedDay - 1
                    ? "bg-[var(--color-background)] border border-[var(--color-border)]"
                    : "bg-transparent border border-transparent hover:border-[var(--color-border)]"
              }`}
            >
              <p
                className={`font-medium text-xs ${index === selectedDay ? "text-white" : "text-[var(--color-text-muted)]"}`}
              >
                {day.dayLabel}
              </p>
              <p
                className={`text-xs ${index === selectedDay ? "text-white/80" : ""}`}
              >
                {day.date}
              </p>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Current Day Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selectedDay}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          {/* Day Header */}
          <div className="p-5 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-900/50 dark:to-gray-900/50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xl font-bold">{currentDay.dayLabel}</h3>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {currentDay.date}
                </p>
              </div>

              <div className="text-right">
                <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                  {dayProgress}%
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Complete
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="h-2 bg-[var(--color-border)] rounded-full overflow-hidden mb-2">
              <motion.div
                animate={{ width: `${dayProgress}%` }}
                transition={{ duration: 0.5 }}
                className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full"
              />
            </div>

            <div className="flex items-center justify-between text-sm text-[var(--color-text-muted)]">
              <span>
                {dayCompletedSessions} of {currentDay.sessions.length} sessions
                done
              </span>
              <span>{currentDay.totalTime} estimated</span>
            </div>
          </div>

          {/* Sessions List */}
          <div className="p-5 space-y-3">
            {currentDay.sessions.map((session) => {
              const isCompleted = completedSessions.has(session.id);
              const isExpanded = expandedSession === session.id;

              return (
                <motion.div
                  key={session.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className={`rounded-xl border transition-all ${
                    isCompleted
                      ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800"
                      : "bg-white dark:bg-slate-800 border-[var(--color-border)] hover:border-indigo-200 dark:hover:border-indigo-800"
                  }`}
                >
                  {/* Session Header */}
                  <button
                    onClick={() =>
                      setExpandedSession(isExpanded ? null : session.id)
                    }
                    className="w-full p-4 text-left flex items-start gap-3"
                  >
                    {/* Icon */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        session.type === "learn"
                          ? "bg-blue-100 dark:bg-blue-900/40"
                          : session.type === "flashcard"
                            ? "bg-orange-100 dark:bg-orange-900/40"
                            : session.type === "quiz"
                              ? "bg-purple-100 dark:bg-purple-900/40"
                              : "bg-green-100 dark:bg-green-900/40"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      ) : (
                        <>
                          {session.type === "learn" && (
                            <BookOpen className="w-5 h-5 text-blue-500" />
                          )}
                          {session.type === "flashcard" && (
                            <Layers className="w-5 h-5 text-orange-500" />
                          )}
                          {session.type === "quiz" && (
                            <HelpCircle className="w-5 h-5 text-purple-500" />
                          )}
                          {session.type === "review" && (
                            <BarChart3 className="w-5 h-5 text-green-500" />
                          )}
                        </>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`font-medium ${isCompleted ? "line-through text-emerald-600 dark:text-emerald-400" : ""}`}
                        >
                          {session.title}
                        </p>

                        {/* Difficulty Badge */}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                            session.difficulty === "hard"
                              ? "bg-red-100 dark:bg-red-900/40 text-red-600"
                              : session.difficulty === "medium"
                                ? "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700"
                                : "bg-green-100 dark:bg-green-900/40 text-green-600"
                          }`}
                        >
                          {session.difficulty}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 mt-1.5 text-xs text-[var(--color-text-muted)]">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {session.duration}
                        </span>
                        <span>📈 +{session.learningGain}% gain</span>
                        <span
                          className={`${
                            session.energyRequired === "low"
                              ? "text-green-500"
                              : session.energyRequired === "medium"
                                ? "text-yellow-500"
                                : "text-red-500"
                          }`}
                        >
                          {"⚡".repeat(
                            session.energyRequired === "low"
                              ? 1
                              : session.energyRequired === "medium"
                                ? 2
                                : 3,
                          )}{" "}
                          energy
                        </span>
                      </div>
                    </div>
                  </button>

                  {/* Expanded Details */}
                  <AnimatePresence>
                    {isExpanded && !isCompleted && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="px-4 pb-4 pt-0"
                      >
                        <div className="border-t border-dashed border-[var(--color-border)] pt-3 space-y-3">
                          {/* Stats */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="text-center p-2 bg-[var(--color-background)] rounded-lg">
                              <p className="text-xs text-[var(--color-text-muted)]">
                                Priority
                              </p>
                              <p
                                className={`text-sm font-semibold capitalize ${session.priority === "high" ? "text-red-500" : session.priority === "medium" ? "text-yellow-500" : "text-green-500"}`}
                              >
                                {session.priority}
                              </p>
                            </div>
                            <div className="text-center p-2 bg-[var(--color-background)] rounded-lg">
                              <p className="text-xs text-[var(--color-text-muted)]">
                                Learning
                              </p>
                              <p className="text-sm font-semibold text-blue-500">
                                {session.learningGain}%
                              </p>
                            </div>
                            <div className="text-center p-2 bg-[var(--color-background)] rounded-lg">
                              <p className="text-xs text-[var(--color-text-muted)]">
                                Duration
                              </p>
                              <p className="text-sm font-semibold">
                                {session.duration}
                              </p>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2">
                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => {
                                setExpandedSession(null);
                                onViewWorkspace();
                              }}
                              className="flex-1 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2"
                            >
                              <Play className="w-4 h-4" />
                              Open Workspace
                            </motion.button>

                            <motion.button
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => {
                                onSessionComplete(session.id);
                                setExpandedSession(null);
                              }}
                              className="py-2.5 px-4 bg-[var(--color-background)] rounded-lg text-sm font-medium hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-1.5"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              Complete
                            </motion.button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}

            {/* Complete Day Button */}
            {dayProgress === 100 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="pt-2"
              >
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={onCompleteDay}
                  className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Celebrate Today's Progress!
                </motion.button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
