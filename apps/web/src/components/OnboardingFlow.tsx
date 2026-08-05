import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Moon, Sun, Sparkles } from "lucide-react";
import { StepWelcome } from "./onboarding/StepWelcome";
import { StepCourse } from "./onboarding/StepCourse";
import { StepConfidence } from "./onboarding/StepConfidence";
import { StepComplete } from "./onboarding/StepComplete";
import { StepUpload } from "./onboarding/StepUpload";

export type OnboardingData = {
  examTiming: string;
  course: string;
  confidence: number;
};

interface OnboardingFlowProps {
  onBack: () => void;
  isDark: boolean;
  onToggleDark: () => void;
  onGoToUpload: () => void;
}

const steps = [
  { number: 1, title: "Exam Timing" },
  { number: 2, title: "Course" },
  { number: 3, title: "Confidence" },
  { number: 4, title: "Ready" },
];

export function OnboardingFlow({
  onBack,
  isDark,
  onToggleDark,
  onGoToUpload,
}: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [data, setData] = useState<OnboardingData>({
    examTiming: "",
    course: "",
    confidence: 50,
  });
  const [direction, setDirection] = useState(1);

  const handleNext = () => {
    if (currentStep < 4) {
      setDirection(1);
      setCurrentStep((prev) => prev + 1);
    } else if (currentStep === 4) {
      // After step 4 (Complete), navigate to dedicated Upload page
      onGoToUpload();
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1);
      setCurrentStep((prev) => prev - 1);
    } else {
      onBack();
    }
  };

  const updateData = (key: keyof OnboardingData, value: string | number) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction * 300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction * -300,
      opacity: 0,
    }),
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)] flex flex-col">
      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="px-6 py-5 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]"
      >
        <div className="flex items-center gap-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleBack}
            className="p-2 rounded-xl hover:bg-[var(--color-border)] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold">AVANA</span>
          </div>
        </div>

        <button
          onClick={onToggleDark}
          className="p-2 rounded-lg hover:bg-[var(--color-border)] transition-colors"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </motion.header>

      {/* Progress Bar */}
      {currentStep <= 4 && (
        <div className="px-6 py-4 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
          <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between mb-2">
              {steps.map((step, index) => (
                <div key={step.number} className="flex items-center">
                  <div
                    className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                      currentStep > step.number
                        ? "bg-indigo-600 text-white"
                        : currentStep === step.number
                          ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400"
                          : "bg-[var(--color-border)] text-[var(--color-text-muted)]"
                    }`}
                  >
                    {currentStep > step.number ? "✓" : step.number}
                  </div>
                  {index < steps.length - 1 && (
                    <div
                      className={`w-16 sm:w-24 h-0.5 mx-2 transition-colors ${
                        currentStep > step.number + 1
                          ? "bg-indigo-600"
                          : "bg-[var(--color-border)]"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-[var(--color-text-muted)] px-1">
              {steps.map((step) => (
                <span
                  key={step.number}
                  className={
                    currentStep === step.number
                      ? "text-indigo-600 dark:text-indigo-400 font-medium"
                      : ""
                  }
                >
                  {step.title}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentStep}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: "spring", stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="w-full max-w-lg"
          >
            {currentStep === 1 && (
              <StepWelcome
                data={data}
                onUpdate={updateData}
                onNext={handleNext}
              />
            )}
            {currentStep === 2 && (
              <StepCourse
                data={data}
                onUpdate={updateData}
                onNext={handleNext}
              />
            )}
            {currentStep === 3 && (
              <StepConfidence
                data={data}
                onUpdate={updateData}
                onNext={handleNext}
              />
            )}
            {currentStep === 4 && <StepComplete onNext={handleNext} />}
            {currentStep === 5 && <StepUpload />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
