import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Maximize2, Timer } from "lucide-react";

import { PlanHeader } from "./planner/PlanHeader";
import { TimelineView } from "./planner/TimelineView";
import { ProgressDashboard } from "./planner/ProgressDashboard";
import { AIRecommendations } from "./planner/AIRecommendations";
import { ExamReadinessGauge } from "./planner/ExamReadinessGauge";
import { FocusMode } from "./planner/FocusMode";
import { StudyTimer } from "./planner/StudyTimer";
import { DaySummary } from "./planner/DaySummary";
import { PlannerTopBar } from "./planner/PlannerTopBar";

// Complete study plan data
const studyPlanData = {
  course: "Cardiovascular Pharmacology",
  professor: "Dr. Patricia Chen",
  examDate: new Date("2024-12-18"),
  totalChapters: 8,
  estimatedTotalTime: "12h 30m",
  currentConfidence: 52,
  predictedReadiness: 68,
  daysRemaining: 14,
};

interface StudyPlannerProps {
  isDark: boolean;
  onToggleDark: () => void;
  onGoToWorkspace: () => void;
}

export type ViewMode = "plan" | "focus" | "timer" | "summary";

export function StudyPlanner({
  isDark,
  onToggleDark,
  onGoToWorkspace,
}: StudyPlannerProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("plan");
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [completedSessions, setCompletedSessions] = useState<Set<string>>(
    new Set(["session-1-1", "session-1-2"]),
  );
  const [showDaySummary, setShowDaySummary] = useState(false);

  const handleSessionComplete = (sessionId: string) => {
    setCompletedSessions((prev) => {
      const updated = new Set(prev);
      updated.add(sessionId);

      // Check if day is complete after this session
      return updated;
    });
  };

  const handleStartFocusMode = () => {
    setViewMode("focus");
  };

  const handleStartTimer = () => {
    setViewMode("timer");
  };

  const handleExitView = () => {
    setViewMode("plan");
  };

  const handleCompleteDay = () => {
    setShowDaySummary(true);
  };

  return (
    <div
      className={`min-h-screen bg-[var(--color-background)] ${isDark ? "dark" : ""}`}
    >
      <AnimatePresence mode="wait">
        {/* Normal Plan View */}
        {viewMode === "plan" && !showDaySummary && (
          <motion.div
            key="plan-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen"
          >
            {/* Top Bar */}
            <PlannerTopBar
              isDark={isDark}
              onToggleDark={onToggleDark}
              onBack={onGoToWorkspace}
              studyPlan={studyPlanData}
              onStartTimer={handleStartTimer}
              onFocusMode={handleStartFocusMode}
            />

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-6 py-8">
              {/* Header Section */}
              <PlanHeader data={studyPlanData} />

              {/* Two Column Layout */}
              <div className="grid lg:grid-cols-3 gap-8 mt-10">
                {/* Left Column - Timeline */}
                <div className="lg:col-span-2 space-y-6">
                  <TimelineView
                    selectedDay={selectedDayIndex}
                    onSelectDay={setSelectedDayIndex}
                    completedSessions={completedSessions}
                    onSessionComplete={handleSessionComplete}
                    onViewWorkspace={onGoToWorkspace}
                    onCompleteDay={handleCompleteDay}
                  />

                  {/* AI Recommendations */}
                  <AIRecommendations />
                </div>

                {/* Right Column - Stats */}
                <div className="space-y-6">
                  <ProgressDashboard
                    completedSessions={completedSessions}
                    planData={studyPlanData}
                  />

                  <ExamReadinessGauge
                    readiness={studyPlanData.predictedReadiness}
                    confidence={studyPlanData.currentConfidence}
                  />

                  {/* Quick Actions */}
                  <QuickActions
                    onFocusMode={handleStartFocusMode}
                    onTimer={handleStartTimer}
                  />
                </div>
              </div>
            </main>
          </motion.div>
        )}

        {/* Focus Mode */}
        {viewMode === "focus" && <FocusMode onClose={handleExitView} />}

        {/* Timer Mode */}
        {viewMode === "timer" && <StudyTimer onClose={handleExitView} />}

        {/* Day Summary */}
        {showDaySummary && (
          <DaySummary
            onClose={() => setShowDaySummary(false)}
            planData={studyPlanData}
            sessionsCompleted={completedSessions.size}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Quick Actions Component
function QuickActions({
  onFocusMode,
  onTimer,
}: {
  onFocusMode: () => void;
  onTimer: () => void;
}) {
  return (
    <div className="bg-[var(--color-surface)] rounded-2xl p-5 border border-[var(--color-border)]">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4 text-yellow-500" />
        Quick Start
      </h3>

      <div className="space-y-2">
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={onFocusMode}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors group"
        >
          <Maximize2 className="w-5 h-5 text-indigo-500" />
          <div className="text-left">
            <p className="font-medium text-sm">Focus Mode</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Hide distractions
            </p>
          </div>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={onTimer}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors group"
        >
          <Timer className="w-5 h-5 text-orange-500" />
          <div className="text-left">
            <p className="font-medium text-sm">Study Timer</p>
            <p className="text-xs text-[var(--color-text-muted)]">
              Pomodoro mode
            </p>
          </div>
        </motion.button>
      </div>
    </div>
  );
}
