import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, FileText, X, ArrowLeft, Sparkles } from "lucide-react";

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

    if (e.dataTransfer.files.length > 0) {
      const newFileNames = Array.from(e.dataTransfer.files).map((f) => f.name);
      setFiles((prev) => [...prev, ...newFileNames]);
    }
  }, []);

  return (
    <div className="space-y-8" dir="rtl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-3"
      >
        <h2 className="text-2xl sm:text-3xl font-black text-[var(--color-text)]">
          بارگذاری جزوه یا اسلایدهای درسی
        </h2>
        <p className="text-sm sm:text-base text-[var(--color-text-muted)] leading-relaxed">
          فایل‌های PDF جزوات و اسلایدهای درسی خود را برای ساخت بسته یادگیری هوشمند بارگذاری کنید.
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
            borderColor: isDragOver ? "#008080" : undefined,
            backgroundColor: isDragOver
              ? "rgba(0, 128, 128, 0.08)"
              : undefined,
            scale: isDragOver ? 1.01 : 1,
          }}
          className={`relative border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-colors ${
            isDragOver
              ? "border-[#008080] bg-[#008080]/10"
              : "border-[var(--color-border)] hover:border-[#008080] bg-[var(--color-surface)]"
          }`}
          onClick={() => document.getElementById("file-upload")?.click()}
        >
          <input
            id="file-upload"
            type="file"
            accept=".pdf,.pptx,.ppt,.docx"
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
            className="mb-4 inline-block"
          >
            <div
              className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center ${
                isDragOver
                  ? "bg-[#a7d0e6]/40 text-[#008080]"
                  : "bg-[#a7d0e6]/25 text-[#008080]"
              }`}
            >
              <Upload className="w-8 h-8" />
            </div>
          </motion.div>

          <p className="text-base font-bold text-[var(--color-text)] mb-1">
            {isDragOver
              ? "فایل‌ها را اینجا رها کنید"
              : "فایل‌ها را به این قسمت بکشید یا برای انتخاب کلیک کنید"}
          </p>
          <p className="text-xs text-[var(--color-text-muted)] font-mono" dir="ltr">
            پشتیبانی از PDF، PPTX، DOCX تا حداکثر ۵۰ مگابایت
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
                className="flex items-center gap-3 p-3.5 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)]"
              >
                <div className="w-9 h-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-red-500" />
                </div>
                <span className="font-semibold text-xs text-[var(--color-text)] truncate" dir="ltr">
                  {fileName}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setFiles((prev) => prev.filter((_, i) => i !== index));
                  }}
                  className="mr-auto p-1.5 rounded-lg hover:bg-[var(--color-surface-warm)] transition-colors text-[var(--color-text-muted)] hover:text-red-500"
                >
                  <X className="w-4 h-4" />
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
        className="bg-[var(--color-surface)] rounded-3xl p-6 border border-[var(--color-border)] space-y-4 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#008080]" />
          <span className="font-bold text-sm text-[var(--color-text)]">
            مراحل تولید بسته یادگیری
          </span>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 text-xs">
          {[
            {
              step: "۱",
              label: "استخراج و تحلیل محتوا",
              desc: "خواندن متن و شناسایی سرفصل‌ها",
            },
            {
              step: "۲",
              label: "تولید مواد آموزشی",
              desc: "ایجاد درس‌ها، فلش‌کارت‌ها و آزمون‌ها",
            },
            {
              step: "۳",
              label: "شروع مطالعه هدفمند",
              desc: "مرور تعاملی و ثبت پیشرفت",
            },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-2.5 p-3 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
              <span className="w-6 h-6 rounded-lg bg-[#008080] text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                {item.step}
              </span>
              <div>
                <p className="font-bold text-[var(--color-text)]">{item.label}</p>
                <p className="text-[var(--color-text-muted)] text-[11px] mt-0.5">{item.desc}</p>
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
        }}
        whileTap={{ scale: 0.99 }}
        disabled={files.length === 0}
        className={`w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all ${
          files.length > 0
            ? "bg-[#008080] hover:bg-[#006666] text-white cursor-pointer"
            : "bg-[var(--color-border)] text-[var(--color-text-muted)] cursor-not-allowed"
        }`}
      >
        {files.length > 0 ? (
          <>
            <span>تولید محتوای آموزشی و شروع یادگیری</span>
            <ArrowLeft className="w-4 h-4" />
          </>
        ) : (
          "برای ادامه یک فایل انتخاب کنید"
        )}
      </motion.button>
    </div>
  );
}
