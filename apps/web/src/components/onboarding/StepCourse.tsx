import { useState } from "react";
import { motion } from "framer-motion";
import { Search, BookOpen, ArrowRight, Sparkles, X } from "lucide-react";

interface StepCourseProps {
  data: { course: string };
  onUpdate: (key: "course", value: string) => void;
  onNext: () => void;
}

const courses = [
  { name: "شیمی دارویی ۱", emoji: "⚗️", color: "from-blue-500 to-cyan-500" },
  { name: "شیمی دارویی ۲", emoji: "🧪", color: "from-blue-500 to-indigo-500" },
  { name: "شیمی دارویی ۳", emoji: "🔬", color: "from-indigo-500 to-purple-500" },
  { name: "فارماسیوتیکس ۱", emoji: "💊", color: "from-teal-500 to-emerald-500" },
  { name: "فارماسیوتیکس ۲", emoji: "🧴", color: "from-emerald-500 to-green-500" },
  { name: "فارماسیوتیکس ۳", emoji: "💉", color: "from-cyan-500 to-teal-500" },
  { name: "فارماسیوتیکس ۴", emoji: "🩺", color: "from-sky-500 to-blue-500" },
  { name: "فارماسیوتیکس ۵", emoji: "🏥", color: "from-cyan-600 to-blue-600" },
  { name: "بافت شناسی", emoji: "🧬", color: "from-amber-500 to-orange-500" },
  { name: "بیولوژی", emoji: "🧫", color: "from-green-500 to-emerald-600" },
  { name: "سم شناسی", emoji: "☠️", color: "from-rose-500 to-red-600" },
];

export function StepCourse({ data, onUpdate, onNext }: StepCourseProps) {
  const [searchTerm, setSearchTerm] = useState(data.course);
  const [selected, setSelected] = useState("");
  const [isFocused, setIsFocused] = useState(false);

  const filteredCourses = courses.filter((course) =>
    course.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleSelect = (courseName: string) => {
    setSelected(courseName);
    setSearchTerm(courseName);
    onUpdate("course", courseName);

    setTimeout(() => {
      onNext();
    }, 400);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-3"
      >
        <h2 className="text-3xl font-bold">Which course are you studying?</h2>
        <p className="text-lg text-[var(--color-text-muted)]">
          Select a course to personalize your study experience.
        </p>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-[var(--color-surface)] rounded-2xl p-6 border border-[var(--color-border)]"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-indigo-600" />
          </div>
          <span className="font-semibold text-lg">
            Search or select your course
          </span>
        </div>

        {/* Search Input */}
        <div className={`relative mb-4`}>
          <Search
            className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
              isFocused ? "text-indigo-500" : "text-[var(--color-text-muted)]"
            }`}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Type to search courses..."
            className={`w-full pl-12 pr-12 py-4 rounded-xl bg-[var(--color-background)] border outline-none transition-all duration-200 ${
              isFocused
                ? "border-indigo-500 ring-2 ring-indigo-500/20"
                : "border-[var(--color-border)]"
            }`}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[var(--color-border)] transition-colors"
            >
              <X className="w-4 h-4 text-[var(--color-text-muted)]" />
            </button>
          )}
        </div>

        {/* Course List */}
        <div className="grid gap-2">
          {filteredCourses.map((course) => (
            <motion.button
              key={course.name}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => handleSelect(course.name)}
              className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all duration-200 ${
                selected === course.name
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                  : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]"
              }`}
            >
              <span className="text-2xl">{course.emoji}</span>
              <span
                className={`font-medium ${selected === course.name ? "text-indigo-600 dark:text-indigo-400" : ""}`}
              >
                {course.name}
              </span>
              {selected === course.name && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="ml-auto w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center"
                >
                  <ArrowRight className="w-4 h-4 text-white" />
                </motion.div>
              )}
            </motion.button>
          ))}

          {filteredCourses.length === 0 && (
            <div className="text-center py-8 text-[var(--color-text-muted)]">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No courses found for "{searchTerm}"</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
