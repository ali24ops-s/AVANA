import { useState, useRef } from "react";
import {
  X,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  FileArchive,
  RefreshCw,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import {
  validateContentImport,
  executeContentImport,
  type AdminImportPlan,
  type AdminImportExecutionResult,
} from "../../../lib/api/admin";

interface ContentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ImportStep = "upload" | "preview" | "success";

export function ContentImportModal({ isOpen, onClose, onSuccess }: ContentImportModalProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [plan, setPlan] = useState<AdminImportPlan | null>(null);
  const [result, setResult] = useState<AdminImportExecutionResult | null>(null);
  const [onConflict, setOnConflict] = useState<"skip" | "error">("skip");

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.endsWith(".zip")) {
        setError("لطفاً یک فایل فشرده با فرمت .zip انتخاب نمایید.");
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleValidate = async () => {
    if (!selectedFile) return;
    setValidating(true);
    setError(null);
    try {
      const validatedPlan = await validateContentImport(selectedFile);
      setPlan(validatedPlan);
      setStep("preview");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "اعتبارسنجی بسته با خطا مواجه شد.");
    } finally {
      setValidating(false);
    }
  };

  const handleExecute = async () => {
    if (!plan) return;
    setImporting(true);
    setError(null);
    try {
      const execResult = await executeContentImport(
        plan.planId,
        plan.packageChecksum,
        onConflict,
      );
      setResult(execResult);
      setStep("success");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "اجرای ورود اطلاعات با خطا مواجه شد.");
    } finally {
      setImporting(false);
    }
  };

  const handleFinish = () => {
    onSuccess();
    onClose();
  };

  const renderSummaryRows = () => {
    if (!plan) return null;
    const { summary } = plan;

    const rows = [
      { label: "دوره‌ها (Courses)", stats: summary.courses },
      { label: "ماژول‌ها (Modules)", stats: summary.modules },
      { label: "درس‌ها (Lessons)", stats: summary.lessons },
      { label: "اسناد (Documents)", stats: summary.documents },
      { label: "محتوای هوش مصنوعی", stats: summary.generatedContents },
      { label: "فلش‌کارت‌ها (Flashcards)", stats: summary.flashcards },
      { label: "آزمون‌ها (Quizzes)", stats: summary.quizzes },
      { label: "سوالات (Questions)", stats: summary.questions },
    ];

    return rows.map((r, i) => (
      <tr key={i} className="border-b border-slate-800/80 text-sm">
        <td className="py-2.5 px-3 text-slate-200 font-medium">{r.label}</td>
        <td className="py-2.5 px-3 text-emerald-400 font-semibold text-center">
          {r.stats.new > 0 ? `+${r.stats.new}` : "۰"}
        </td>
        <td className="py-2.5 px-3 text-slate-400 text-center">
          {r.stats.existing > 0 ? r.stats.existing : "۰"}
        </td>
        <td className="py-2.5 px-3 text-amber-400 font-semibold text-center">
          {r.stats.conflict > 0 ? r.stats.conflict : "۰"}
        </td>
      </tr>
    ));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">ورود محتوا (Import Content Package)</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                بارگذاری و انتقال امن محتوای آموزشی به دیتابیس فعلی
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {/* STEP 1: UPLOAD */}
          {step === "upload" && (
            <div className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-teal-500/60 rounded-2xl p-8 text-center cursor-pointer bg-slate-800/20 hover:bg-slate-800/40 transition-all space-y-3"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="mx-auto w-12 h-12 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
                  <FileArchive className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    {selectedFile ? selectedFile.name : "فایل بسته خروجی (.zip) را انتخاب یا اینجا بکشید"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {selectedFile
                      ? `حجم فایل: ${(selectedFile.size / (1024 * 1024)).toFixed(2)} مگابایت`
                      : "حداکثر حجم مجاز: ۵۰ مگابایت"}
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/30 border border-white/5 space-y-2 text-xs text-slate-400">
                <div className="flex items-center gap-2 text-slate-300 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-teal-400" />
                  ملاحظات امنیتی و یکپارچگی ورود اطلاعات
                </div>
                <p>• تمام شناسه‌ها (IDs) متناسب با این پایگاه داده از نو ساخته یا نگاشت می‌شوند.</p>
                <p>• سیستم ابتدا بسته را اعتبارسنجی کرده و قبل از ثبت نهایی پیش‌نمایش تغییرات را نشان می‌دهد.</p>
                <p>• ثبت اطلاعات به صورت کاملاً Transactional انجام گرفته و در صورت بروز خطا هیچ رکوردی نصفه باقی نمی‌ماند.</p>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW */}
          {step === "preview" && plan && (
            <div className="space-y-5">
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  <span>بسته معتبر است و ساختار اطلاعات بررسی گردید.</span>
                </div>
                <span className="text-xs opacity-80">فرمت نسخه {plan.formatVersion}</span>
              </div>

              {/* Table breakdown */}
              <div className="rounded-xl border border-slate-700/80 overflow-hidden">
                <table className="w-full text-right">
                  <thead className="bg-slate-800/80 border-b border-slate-700 text-xs text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">نوع موجودیت</th>
                      <th className="py-2.5 px-3 text-center text-emerald-400">جدید (New)</th>
                      <th className="py-2.5 px-3 text-center">موجود (Skip)</th>
                      <th className="py-2.5 px-3 text-center text-amber-400">تداخل (Conflict)</th>
                    </tr>
                  </thead>
                  <tbody>{renderSummaryRows()}</tbody>
                </table>
              </div>

              {/* Conflict alerts if any */}
              {plan.conflicts.length > 0 && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-2">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    <span>تعداد {plan.conflicts.length} مورد تداخل محتوایی تشخیص داده شد:</span>
                  </div>
                  <ul className="list-disc list-inside text-xs text-amber-300/80 space-y-1 pr-2">
                    {plan.conflicts.slice(0, 5).map((c, idx) => (
                      <li key={idx}>
                        {c.titleOrName} ({c.entityType}): {c.reason}
                      </li>
                    ))}
                    {plan.conflicts.length > 5 && (
                      <li>و {plan.conflicts.length - 5} مورد تداخل دیگر...</li>
                    )}
                  </ul>
                  <div className="pt-2 border-t border-amber-500/20 flex items-center gap-4 text-xs text-slate-300">
                    <span>رفتار با موارد تکراری یا متداخل:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictPolicy"
                        value="skip"
                        checked={onConflict === "skip"}
                        onChange={() => setOnConflict("skip")}
                        className="text-teal-500 focus:ring-teal-500/50"
                      />
                      <span>رد کردن (Skip)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="conflictPolicy"
                        value="error"
                        checked={onConflict === "error"}
                        onChange={() => setOnConflict("error")}
                        className="text-teal-500 focus:ring-teal-500/50"
                      />
                      <span>توقف در صورت خطا</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: SUCCESS */}
          {step === "success" && result && (
            <div className="py-6 text-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-100">عملیات ورود محتوا با موفقیت انجام شد</h3>
                <p className="text-sm text-slate-400 mt-1">
                  تمام روابط و نگاشت شناسه‌ها با موفقیت بازسازی و ذخیره گردید.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto p-4 rounded-xl bg-slate-800/40 border border-slate-700/60 text-sm">
                <div>
                  <div className="text-slate-400 text-xs">رکوردهای جدید ایجادشده:</div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5">
                    {result.counts.created}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-xs">موارد موجود (صرف‌نظر شده):</div>
                  <div className="text-lg font-bold text-slate-300 mt-0.5">
                    {result.counts.skipped}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-slate-800 bg-slate-800/30">
          {step === "preview" ? (
            <button
              type="button"
              onClick={() => setStep("upload")}
              disabled={importing}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              بازگشت به انتخاب فایل
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-3">
            {step !== "success" && (
              <button
                type="button"
                onClick={onClose}
                disabled={validating || importing}
                className="px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50"
              >
                انصراف
              </button>
            )}

            {step === "upload" && (
              <button
                type="button"
                onClick={handleValidate}
                disabled={!selectedFile || validating}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-500 rounded-xl transition-colors shadow-lg shadow-teal-500/20 disabled:opacity-50"
              >
                {validating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    در حال اعتبارسنجی بسته...
                  </>
                ) : (
                  <>
                    <span>بررسی و اعتبارسنجی</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            )}

            {step === "preview" && (
              <button
                type="button"
                onClick={handleExecute}
                disabled={importing}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    در حال انتقال به پایگاه داده...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    شروع ورود محتوا (Start Import)
                  </>
                )}
              </button>
            )}

            {step === "success" && (
              <button
                type="button"
                onClick={handleFinish}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-500 rounded-xl transition-colors shadow-lg shadow-teal-500/20"
              >
                <RefreshCw className="w-4 h-4" />
                بستن و به‌روزرسانی صفحه
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
