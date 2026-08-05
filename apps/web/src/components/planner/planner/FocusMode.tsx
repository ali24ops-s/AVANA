import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronRight, Clock, CheckCircle2 } from "lucide-react";

interface FocusModeProps {
  onClose: () => void;
}

const motivationalMessages = [
  "You're doing great. Keep going! 💪",
  "Focus on understanding, not memorizing.",
  "Small progress is still progress.",
  "Your future self will thank you.",
  "Stay present. You've got this.",
  "Deep work creates deep results.",
];

export function FocusMode({ onClose }: FocusModeProps) {
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(25 * 60); // 25 minutes in seconds
  const [isRunning, setIsRunning] = useState(false);
  const [currentMessage, setCurrentMessage] = useState(motivationalMessages[0]);
  const [taskCompleted, setTaskCompleted] = useState<string[]>([]);

  const tasks = [
    { id: "1", title: "Learn: ACE Inhibitors Mechanism", duration: "25 min" },
    { id: "2", title: "Review: ACE Inhibitor Flashcards", duration: "15 min" },
    { id: "3", title: "Quick Quiz: Chapters 3-4", duration: "10 min" },
    { id: "4", title: "Clinical Pearls Review", duration: "10 min" },
  ];

  const currentTask = tasks[currentTaskIndex];
  const allDone = currentTaskIndex >= tasks.length;

  // Timer countdown
  useEffect(() => {
    if (!isRunning || timeRemaining <= 0) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning, timeRemaining]);

  // Rotate motivational messages
  useEffect(() => {
    const msgInterval = setInterval(() => {
      setCurrentMessage((prev) => {
        const idx = motivationalMessages.indexOf(prev);
        return motivationalMessages[(idx + 1) % motivationalMessages.length];
      });
    }, 15000);

    return () => clearInterval(msgInterval);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const handleCompleteTask = () => {
    setTaskCompleted((prev) => [...prev, currentTask.id]);
    setIsRunning(false);

    setTimeout(() => {
      if (currentTaskIndex < tasks.length - 1) {
        setCurrentTaskIndex((prev) => prev + 1);
        setTimeRemaining(
          currentTaskIndex < tasks.length - 1
            ? parseInt(tasks[currentTaskIndex + 1].duration) * 60
            : 0,
        );
      }
    }, 500);
  };

  const handleSkip = () => {
    if (currentTaskIndex < tasks.length - 1) {
      setCurrentTaskIndex((prev) => prev + 1);
      setTimeRemaining(parseInt(tasks[currentTaskIndex + 1].duration) * 60);
      setIsRunning(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-[#0a0a0a] text-white flex flex-col"
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-6 h-6" />
        </motion.button>

        <span className="text-sm opacity-60 font-medium">FOCUS MODE</span>

        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 opacity-50" />
          <span className="font-mono text-lg">{formatTime(timeRemaining)}</span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 max-w-2xl mx-auto">
        {!allDone ? (
          <>
            {/* Current Task */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTask.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-center mb-12"
              >
                <p className="text-sm uppercase tracking-widest opacity-40 mb-4">
                  Now studying
                </p>
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  {currentTask.title}
                </h2>

                {/* Progress Ring */}
                <div className="relative w-48 h-48 mx-auto my-8">
                  <svg viewBox="0 0 100 100" className="transform -rotate-90">
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="rgba(255,255,255,0.1)"
                      strokeWidth="6"
                    />
                    <motion.circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray={283}
                      initial={{ strokeDashoffset: 283 }}
                      animate={{
                        strokeDashoffset:
                          283 -
                          283 *
                            ((parseInt(currentTask.duration) * 60 -
                              timeRemaining) /
                              (parseInt(currentTask.duration) * 60)),
                      }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-4xl font-bold">
                      {formatTime(timeRemaining)}
                    </span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4 mt-8">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsRunning(!isRunning)}
                    className={`px-8 py-3 rounded-xl font-semibold transition-all ${
                      isRunning ? "bg-white/10" : "bg-indigo-600"
                    }`}
                  >
                    {isRunning ? "Pause" : "Start"}
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCompleteTask}
                    className="px-8 py-3 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-500 transition-all flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Done
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleSkip}
                    className="px-6 py-3 rounded-xl font-medium bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    Skip →
                  </motion.button>
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Task List */}
            <div className="mt-16 space-y-3 w-full max-w-md">
              {tasks.map((task, index) => (
                <div
                  key={task.id}
                  className={`flex items-center gap-3 p-4 rounded-xl ${
                    index === currentTaskIndex
                      ? "bg-white/10 ring-1 ring-white/20"
                      : taskCompleted.includes(task.id)
                        ? "opacity-30"
                        : "opacity-40"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                      taskCompleted.includes(task.id)
                        ? "border-emerald-400 bg-emerald-400"
                        : index === currentTaskIndex
                          ? "border-indigo-400 animate-pulse"
                          : "border-white/20"
                    }`}
                  >
                    {taskCompleted.includes(task.id) && (
                      <CheckCircle2 className="w-4 h-4 text-black" />
                    )}
                  </div>
                  <span className="flex-1">{task.title}</span>
                  <ChevronRight className="w-4 h-4 opacity-30" />
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Completion State */
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <span className="text-7xl mb-6 block">🎉</span>
            <h2 className="text-3xl font-bold mb-4">Focus Session Complete!</h2>
            <p className="text-xl opacity-60 mb-8">You crushed it today.</p>

            <div className="grid grid-cols-3 gap-4 mb-8 max-w-sm mx-auto">
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-2xl font-bold">4</p>
                <p className="text-xs opacity-50">Tasks</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-2xl font-bold">60m</p>
                <p className="text-xs opacity-50">Studied</p>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <p className="text-2xl font-bold">100%</p>
                <p className="text-xs opacity-50">Complete</p>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={onClose}
              className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl font-semibold"
            >
              Back to Plan
            </motion.button>
          </motion.div>
        )}
      </div>

      {/* Motivational Message */}
      <AnimatePresence mode="wait">
        <motion.p
          key={currentMessage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="text-center pb-8 text-sm opacity-40 italic"
        >
          ✨ {currentMessage}
        </motion.p>
      </AnimatePresence>
    </motion.div>
  );
}
