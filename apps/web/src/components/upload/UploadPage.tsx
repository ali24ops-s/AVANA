import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Moon,
  Sun,
  Sparkles,
  Upload as UploadIcon,
  FileText,
  X,
  Check,
  Clock,
  Layers,
  BookOpen,
  HelpCircle,
  BarChart3,
  ArrowRight,
  Image as ImageIcon,
} from "lucide-react";

interface UploadPageProps {
  onBack: () => void;
  isDark: boolean;
  onToggleDark: () => void;
  onStartProcessing: () => void;
}

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  pages?: number;
}

const recentUploads = [
  {
    name: "Cardiovascular_Pharmacology_Week12.pdf",
    size: "4.2 MB",
    time: "2 days ago",
  },
  { name: "Antibiotics_Lecture_Notes.pdf", size: "2.8 MB", time: "5 days ago" },
];

const supportedFormats = [
  { ext: "PDF", icon: "📄", desc: "Lecture slides & notes" },
  { ext: "PPT/PPTX", icon: "📊", desc: "PowerPoint presentations" },
  { ext: "DOC/DOCX", icon: "📝", desc: "Lecture notes" },
];

export function UploadPage({
  onBack,
  isDark,
  onToggleDark,
  onStartProcessing,
}: UploadPageProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    // Simulate PDF detection - in real app would use pdf-lib or similar
    const newFile: UploadedFile = {
      name: file.name,
      size: file.size,
      type: file.type || "application/pdf",
      pages: Math.floor(Math.random() * 40) + 15, // Simulate page count
    };
    setUploadedFile(newFile);

    // Show preview after brief delay for animation
    setTimeout(() => setShowPreview(true), 300);
  };

  const removeFile = () => {
    setUploadedFile(null);
    setShowPreview(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getProcessingEstimate = () => {
    const baseTime = 45; // seconds
    if (!uploadedFile?.pages) return `${baseTime}s`;
    const pages = uploadedFile.pages;
    const estimatedSeconds = Math.min(baseTime + pages * 2, 120); // Max 2 minutes
    if (estimatedSeconds < 60) return `~${estimatedSeconds} seconds`;
    return `~${Math.ceil(estimatedSeconds / 60)} minute${estimatedSeconds >= 120 ? "s" : ""}`;
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)]">
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
            onClick={onBack}
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

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-12">
        {!showPreview ? (
          /* Initial Upload State */
          <AnimatePresence mode="wait">
            <motion.div
              key="upload-initial"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              {/* Title Section */}
              <div className="text-center space-y-3 max-w-2xl mx-auto">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring" }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-sm font-medium mb-4"
                >
                  <Sparkles className="w-4 h-4" />
                  Step 1 of 2
                </motion.div>

                <h1 className="text-4xl md:text-5xl font-bold leading-tight">
                  Let's build your{" "}
                  <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
                    study workspace.
                  </span>
                </h1>
                <p className="text-xl text-[var(--color-text-muted)]">
                  Upload your professor's slides or lecture notes.
                </p>
              </div>

              {/* Supported Formats */}
              <div className="flex justify-center gap-6 flex-wrap">
                {supportedFormats.map((format) => (
                  <div
                    key={format.ext}
                    className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]"
                  >
                    <span className="text-lg">{format.icon}</span>
                    <span>{format.ext}</span>
                    <span className="hidden sm:inline">• {format.desc}</span>
                  </div>
                ))}
              </div>

              {/* Upload Area */}
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
                className={`relative border-2 border-dashed rounded-3xl p-16 text-center cursor-pointer transition-all ${
                  isDragOver
                    ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30"
                    : "border-[var(--color-border)] hover:border-indigo-300 hover:bg-[var(--color-surface)]"
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  id="file-upload-large"
                  type="file"
                  accept=".pdf,.ppt,.pptx,.doc,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* Medical Illustration Background */}
                <div className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
                  <div className="absolute top-8 left-12 w-32 h-32 rounded-full bg-gradient-to-br from-blue-100 to-cyan-100 dark:from-blue-900/20 dark:to-cyan-900/20 blur-3xl" />
                  <div className="absolute bottom-8 right-12 w-40 h-40 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20 blur-3xl" />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 blur-2xl" />
                </div>

                {/* Content */}
                <div className="relative z-10">
                  {/* Floating illustration */}
                  <motion.div
                    animate={{ y: [0, -8, 0] }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="mb-8 inline-block"
                  >
                    <div className="w-28 h-28 mx-auto rounded-3xl bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-indigo-950/50 dark:via-purple-950/30 dark:to-pink-950/50 flex items-center justify-center shadow-xl shadow-indigo-200/50 dark:shadow-indigo-950/50">
                      <div className="relative">
                        <UploadIcon
                          className="w-14 h-14 text-indigo-500"
                          strokeWidth={1.5}
                        />
                        <motion.div
                          animate={{ y: [0, 4, 0], opacity: [0.7, 1, 0.7] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-indigo-400"
                        />
                      </div>
                    </div>
                  </motion.div>

                  <h3 className="text-2xl font-semibold mb-2">
                    {isDragOver ? "Release to upload" : "Drop files here"}
                  </h3>
                  <p className="text-[var(--color-text-muted)] mb-6">
                    or click to browse your files
                  </p>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-shadow"
                  >
                    Browse Files
                  </motion.button>

                  <p className="mt-6 text-sm text-[var(--color-text-muted)]">
                    Maximum file size: 50MB • Supported formats: PDF, PPT, DOC
                  </p>
                </div>
              </motion.div>

              {/* Recent Uploads */}
              {recentUploads.length > 0 && (
                <div className="max-w-xl mx-auto">
                  <h4 className="text-sm font-medium text-[var(--color-text-muted)] mb-3">
                    Recent uploads
                  </h4>
                  <div className="space-y-2">
                    {recentUploads.map((file, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.5 + index * 0.1 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-transparent hover:shadow-md transition-all cursor-pointer group"
                        onClick={() => {
                          setUploadedFile({
                            name: file.name,
                            size: parseFloat(file.size),
                            type: "application/pdf",
                            pages: 24,
                          });
                          setShowPreview(true);
                        }}
                      >
                        <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                          <FileText className="w-5 h-5 text-red-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate group-hover:text-indigo-600 transition-colors">
                            {file.name}
                          </p>
                          <p className="text-xs text-[var(--color-text-muted)]">
                            {file.size} • {file.time}
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        ) : (
          /* File Preview State */
          <AnimatePresence mode="wait">
            <motion.div
              key="upload-preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid lg:grid-cols-2 gap-8 items-start"
            >
              {/* Left - File Preview Card */}
              <div className="space-y-6">
                <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-8 space-y-6">
                  {/* File Header */}
                  <div className="flex items-start gap-4">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                      className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-400 to-orange-500 flex items-center justify-center flex-shrink-0 shadow-lg"
                    >
                      <FileText className="w-8 h-8 text-white" />
                    </motion.div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg truncate">
                        {uploadedFile?.name}
                      </h3>
                      <p className="text-sm text-[var(--color-text-muted)]">
                        {uploadedFile && formatFileSize(uploadedFile.size)}
                      </p>

                      <button
                        onClick={removeFile}
                        className="mt-3 flex items-center gap-1.5 text-sm text-red-500 hover:text-red-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                        Remove file
                      </button>
                    </div>
                  </div>

                  <div className="h-px bg-[var(--color-border)]" />

                  {/* Estimated Stats */}
                  <div>
                    <h4 className="font-medium mb-4 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-indigo-500" />
                      What AVANA will create:
                    </h4>

                    <div className="grid grid-cols-2 gap-3">
                      {[
                        {
                          label: "Pages detected",
                          value: uploadedFile?.pages || "--",
                          icon: FileText,
                          color: "text-blue-500",
                        },
                        {
                          label: "Estimated chapters",
                          value: uploadedFile?.pages
                            ? Math.ceil(uploadedFile!.pages / 8)
                            : "--",
                          icon: BookOpen,
                          color: "text-purple-500",
                        },
                        {
                          label: "Flashcards generated",
                          value: uploadedFile?.pages
                            ? uploadedFile.pages * 7
                            : "--",
                          icon: Layers,
                          color: "text-orange-500",
                        },
                        {
                          label: "Quiz questions",
                          value: uploadedFile?.pages
                            ? Math.ceil(uploadedFile.pages * 2.5)
                            : "--",
                          icon: HelpCircle,
                          color: "text-green-500",
                        },
                      ].map((stat) => (
                        <div
                          key={stat.label}
                          className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-background)]"
                        >
                          <stat.icon className={`w-5 h-5 ${stat.color}`} />
                          <div>
                            <p className="text-xs text-[var(--color-text-muted)]">
                              {stat.label}
                            </p>
                            <p className="font-semibold">
                              {typeof stat.value === "number"
                                ? stat.value.toLocaleString()
                                : stat.value}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="h-px bg-[var(--color-border)]" />

                  {/* Processing Time */}
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/30">
                    <Clock className="w-5 h-5 text-indigo-500" />
                    <div>
                      <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                        Estimated processing time
                      </p>
                      <p className="text-xs text-indigo-600/70 dark:text-indigo-400/70">
                        {getProcessingEstimate()}
                      </p>
                    </div>
                  </div>

                  {/* Action Button */}
                  <motion.button
                    whileHover={{
                      scale: 1.01,
                      boxShadow: "0 20px 40px -15px rgba(99, 102, 241, 0.4)",
                    }}
                    whileTap={{ scale: 0.99 }}
                    onClick={onStartProcessing}
                    className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/25"
                  >
                    <Sparkles className="w-5 h-5" />
                    Upload & Analyze
                    <ArrowRight className="w-5 h-5" />
                  </motion.button>

                  <p className="text-center text-xs text-[var(--color-text-muted)]">
                    Your data is encrypted and secure
                  </p>
                </div>
              </div>

              {/* Right - Preview Illustration */}
              <div className="relative hidden lg:block">
                {/* Glow effects */}
                <div className="absolute -inset-10 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 rounded-3xl blur-3xl" />

                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="relative bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-8 shadow-2xl"
                >
                  {/* Preview Header */}
                  <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)] mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                        <ImageIcon className="w-4 h-4 text-white" />
                      </div>
                      <span className="font-medium text-sm">Preview</span>
                    </div>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {uploadedFile?.name.slice(-15)}
                    </span>
                  </div>

                  {/* Mock PDF Preview */}
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 + i * 0.08 }}
                        className={`rounded-lg ${i === 2 ? "bg-indigo-100 dark:bg-indigo-900/30" : "bg-[var(--color-background)]"} p-3`}
                      >
                        <div
                          className={`h-2.5 rounded-full ${i === 2 ? "w-4/5 bg-indigo-300 dark:bg-indigo-700" : `w-${[75, 90, 80, 60, 85][i]}% bg-[var(--color-border)]`} mb-2`}
                          style={{ width: `${[75, 90, 80, 60, 85][i]}%` }}
                        />
                        <div
                          className={`h-2 rounded-full ${i === 2 ? "w-3/5 bg-indigo-200 dark:bg-indigo-800/50" : `bg-[var(--color-border)]`}`}
                          style={{ width: `${[55, 65, 48, 70, 58][i]}%` }}
                        />
                      </motion.div>
                    ))}
                  </div>

                  {/* Page indicator */}
                  <div className="mt-6 pt-4 border-t border-[var(--color-border)] flex items-center justify-between">
                    <span className="text-xs text-[var(--color-text-muted)]">
                      Page 1 of {uploadedFile?.pages}
                    </span>
                    <div className="flex gap-1">
                      {[...Array(Math.min(3, uploadedFile?.pages || 1))].map(
                        (_, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-indigo-500" : "bg-[var(--color-border)]"}`}
                          />
                        ),
                      )}
                    </div>
                  </div>
                </motion.div>

                {/* Floating AI Badge */}
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="absolute -bottom-4 -right-4 bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-4 border border-[var(--color-border)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">AI Ready</p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Click to process
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </main>
    </div>
  );
}
