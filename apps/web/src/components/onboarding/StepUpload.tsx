import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, FileText, X, ArrowRight, Sparkles } from "lucide-react";

export function StepUpload() {
  const [isDragOver, setIsDragOver] = useState(false);
  const [files, setFiles] = useState<string[]>([]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    // Simulate file handling
    if (e.dataTransfer.files.length > 0) {
      const newFileNames = Array.from(e.dataTransfer.files).map((f) => f.name);
      setFiles((prev) => [...prev, ...newFileNames]);
    }
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-3"
      >
        <h2 className="text-3xl font-bold">Upload Your Lecture</h2>
        <p className="text-lg text-[var(--color-text-muted)]">
          Drag & drop your PDF slides or click to browse.
        </p>
      </motion.div>

      {/* Upload Area */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <motion.div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          animate={{
            borderColor: isDragOver ? "#6366f1" : undefined,
            backgroundColor: isDragOver
              ? "rgba(99, 102, 241, 0.05)"
              : undefined,
            scale: isDragOver ? 1.02 : 1,
          }}
          className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${
            isDragOver
              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
              : "border-[var(--color-border)] hover:border-[var(--color-text-muted)]"
          }`}
          onClick={() => document.getElementById("file-upload")?.click()}
        >
          <input
            id="file-upload"
            type="file"
            accept=".pdf,.pptx,.ppt"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                const newFileNames = Array.from(e.target.files).map(
                  (f) => f.name,
                );
                setFiles((prev) => [...prev, ...newFileNames]);
              }
            }}
          />

          {/* Upload Icon */}
          <motion.div
            animate={{ y: isDragOver ? -5 : 0 }}
            className="mb-6 inline-block"
          >
            <div
              className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${
                isDragOver
                  ? "bg-indigo-100 dark:bg-indigo-900"
                  : "bg-[var(--color-background)]"
              }`}
            >
              <Upload
                className={`w-10 h-10 ${isDragOver ? "text-indigo-500" : "text-[var(--color-text-muted)]"}`}
              />
            </div>
          </motion.div>

          <p className="text-lg font-semibold mb-2">
            {isDragOver
              ? "Drop your files here"
              : "Drop files here or click to upload"}
          </p>
          <p className="text-[var(--color-text-muted)]">
            Supports PDF, PPT, PPTX • Max 10MB each
          </p>
        </motion.div>

        {/* Uploaded Files Preview */}
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mt-4 space-y-2"
          >
            {files.map((fileName, index) => (
              <motion.div
                key={`${fileName}-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 p-4 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]"
              >
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-red-500" />
                </div>
                <span className="font-medium truncate">{fileName}</span>
                <button
                  onClick={() =>
                    setFiles((prev) => prev.filter((_, i) => i !== index))
                  }
                  className="ml-auto p-1 rounded hover:bg-[var(--color-border)] transition-colors"
                >
                  <X className="w-4 h-4 text-[var(--color-text-muted)]" />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* What Happens Next */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-[var(--color-surface)] rounded-2xl p-6 border border-[var(--color-border)]"
      >
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          <span className="font-semibold">What happens next</span>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          {[
            {
              icon: "🧠",
              label: "AI analyzes content",
              desc: "Extracts key concepts",
            },
            {
              icon: "📝",
              label: "Creates materials",
              desc: "Lessons, flashcards, quizzes",
            },
            {
              icon: "🎯",
              label: "Your workspace ready",
              desc: "Start studying immediately",
            },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-3">
              <span className="text-xl">{item.icon}</span>
              <div>
                <p className="font-medium">{item.label}</p>
                <p className="text-[var(--color-text-muted)]">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Submit Button */}
      <motion.button
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        whileHover={{
          scale: 1.01,
          boxShadow: "0 20px 40px -15px rgba(99, 102, 241, 0.5)",
        }}
        whileTap={{ scale: 0.99 }}
        disabled={files.length === 0}
        className={`w-full py-5 rounded-2xl font-semibold text-xl flex items-center justify-center gap-3 shadow-xl transition-all ${
          files.length > 0
            ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-indigo-500/25 cursor-pointer"
            : "bg-[var(--color-border)] text-[var(--color-text-muted)] cursor-not-allowed"
        }`}
      >
        {files.length > 0 ? (
          <>
            Generate Study Materials
            <ArrowRight className="w-6 h-6" />
          </>
        ) : (
          "Select a file to continue"
        )}
      </motion.button>

      <p className="text-center text-xs text-[var(--color-text-muted)]">
        By uploading, you agree to our Terms of Service and Privacy Policy
      </p>
    </div>
  );
}
