/**
 * TeacherPlatformPreviews.
 *
 * Deterministic, high-fidelity visual representations of authentic AVANA Teacher Platform UI.
 * Built strictly according to the AVANA design system:
 * - Light surface (#FFFFFF) on default background (#F7F9FA)
 * - Border (#E2E7EA) and Primary Teal (#008080)
 * - Estedad Persian typography, Lucide icons
 * - Clean App Window framing with soft shadow and delicate borders
 */

import {
  Users,
  Copy,
  Check,
  CheckCircle2,
  Clock,
  Award,
  TrendingUp,
  FileCheck2,
  FileText,
  Sliders,
  Sparkles,
  HelpCircle,
  BarChart3,
} from "lucide-react";
import { useState } from "react";
import { Badge, Progress } from "../../ui/index.js";

interface AppWindowProps {
  title: string;
  badgeText?: string;
  children: React.ReactNode;
}

export function AppWindow({ title, badgeText, children }: AppWindowProps) {
  return (
    <div className="w-full rounded-2xl bg-white border border-[#E2E7EA] shadow-xs overflow-hidden text-right flex flex-col">
      {/* Window Title Bar */}
      <div className="bg-[#F7F9FA] border-b border-[#E2E7EA] px-4 py-2.5 flex items-center justify-between select-none">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#E2E7EA]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#E2E7EA]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#E2E7EA]" />
          </div>
          <span className="text-xs font-semibold text-[#5B6268] mr-2">
            {title}
          </span>
        </div>
        {badgeText && (
          <span className="text-[11px] font-medium text-[#008080] bg-teal-50 border border-teal-200/80 px-2 py-0.5 rounded-md">
            {badgeText}
          </span>
        )}
      </div>

      {/* Window Body */}
      <div className="p-4 sm:p-5 flex-1 bg-white text-[var(--color-text)]">
        {children}
      </div>
    </div>
  );
}

/**
 * Preview 1: Classrooms & Student Roster
 */
export function ClassroomsPreview() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const members = [
    { name: "سارا محمدی", email: "s.mohammadi@med.ac.ir", date: "۱۲ مهر ۱۴۰۳", status: "فعال" },
    { name: "علی کاظمی", email: "a.kazemi@med.ac.ir", date: "۱۵ مهر ۱۴۰۳", status: "فعال" },
    { name: "نیما رضایی", email: "n.rezaei@med.ac.ir", date: "۱۸ مهر ۱۴۰۳", status: "فعال" },
  ];

  return (
    <AppWindow title="سامانه استاد • مدیریت کلاس‌ها و دانشجویان" badgeText="کلاس فعال">
      <div className="space-y-4">
        {/* Classroom Header Card */}
        <div className="p-4 rounded-xl bg-[#F7F9FA] border border-[#E2E7EA] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-black text-[#1a2226]">
                فارماکولوژی بالینی ورودی ۱۴۰۱
              </h4>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                ترم پاییز
              </span>
            </div>
            <p className="text-xs text-[#5B6268]">
              دانشکده داروسازی • ۲۸ دانشجو عضو • ۳ آزمون تعریف‌شده
            </p>
          </div>

          {/* Invite Code Bar */}
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-[#E2E7EA] shadow-2xs self-start sm:self-auto">
            <span className="text-[11px] text-[#5B6268]">کد دعوت:</span>
            <code className="text-xs font-mono font-bold text-[#008080] tracking-wider select-all">
              AVN-PHARM101
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded text-[#5B6268] hover:text-[#008080] transition-colors"
              title="کپی کد دعوت"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Member Roster Mini Table */}
        <div className="border border-[#E2E7EA] rounded-xl overflow-hidden">
          <div className="bg-[#F7F9FA] px-3.5 py-2 border-b border-[#E2E7EA] flex items-center justify-between">
            <span className="text-xs font-bold text-[#1a2226] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#008080]" />
              <span>فهرست دانشجویان عضو کلاس</span>
            </span>
            <span className="text-[11px] text-[#5B6268]">۲۸ عضو فعال</span>
          </div>

          <div className="divide-y divide-[#E2E7EA] overflow-x-auto">
            {members.map((m, idx) => (
              <div
                key={idx}
                className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-[#F7F9FA]/60 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-teal-50 border border-teal-200/80 text-[#008080] flex items-center justify-center font-bold text-[11px] shrink-0">
                    {m.name.charAt(0)}
                  </div>
                  <div className="truncate">
                    <span className="font-bold text-[#1a2226] block truncate">
                      {m.name}
                    </span>
                    <span className="text-[10px] text-[#5B6268] font-mono block truncate">
                      {m.email}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="hidden sm:inline text-[11px] text-[#5B6268]">
                    {m.date}
                  </span>
                  <Badge variant="success" size="sm">
                    {m.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

/**
 * Preview 2: Exam Builder & Authoring Suite
 */
export function ExamEditorPreview() {
  return (
    <AppWindow title="ویرایشگر آزمون • طراحی سؤالات و کلید پاسخ" badgeText="آزمون‌ساز">
      <div className="space-y-3.5">
        {/* Exam Title & Setting Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#E2E7EA]">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-bold text-[#1a2226]">
              آزمون جامع فارماکولوژی قلب و عروق
            </span>
            <Badge variant="warning" size="sm">
              پیش‌نویس
            </Badge>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[#5B6268]">
            <span className="inline-flex items-center gap-1 bg-[#F7F9FA] border border-[#E2E7EA] px-2 py-0.5 rounded-md">
              <Clock className="w-3 h-3 text-[#008080]" />
              <span>مدت: ۶۰ دقیقه</span>
            </span>
            <span className="hidden sm:inline-flex items-center gap-1 bg-[#F7F9FA] border border-[#E2E7EA] px-2 py-0.5 rounded-md">
              <Sliders className="w-3 h-3 text-[#008080]" />
              <span>حدنصاب: ۷۰٪</span>
            </span>
          </div>
        </div>

        {/* Question Item Box */}
        <div className="p-3.5 rounded-xl border border-[#008080]/30 bg-teal-50/20 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-[#008080] flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>سؤال ۱ (۲ نمره) • ۴ گزینه‌ای</span>
            </span>
            <span className="text-[11px] text-[#5B6268]">زمان اختصاصی: ۴۵ ثانیه</span>
          </div>

          <p className="text-xs sm:text-sm font-medium text-[#1a2226] leading-relaxed">
            کدام‌یک از داروهای زیر یک بتابلاکر انتخابی (Cardioselective) برای گیرنده $\beta_1$ است؟
          </p>

          {/* Options */}
          <div className="space-y-1.5 pt-1">
            <div className="p-2 rounded-lg bg-white border border-[#E2E7EA] text-xs flex items-center justify-between">
              <span className="text-[#3d4f55]">الف) پروپرانولول (Propranolol)</span>
              <span className="w-3.5 h-3.5 rounded-full border border-[#CBD5E1]" />
            </div>

            <div className="p-2 rounded-lg bg-emerald-50/80 border border-emerald-300 text-xs flex items-center justify-between">
              <span className="font-bold text-emerald-900">
                ب) متوپرولول (Metoprolol)
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded">
                <CheckCircle2 className="w-3 h-3" />
                <span>کلید صحیح</span>
              </span>
            </div>

            <div className="p-2 rounded-lg bg-white border border-[#E2E7EA] text-xs flex items-center justify-between">
              <span className="text-[#3d4f55]">ج) کارودیلول (Carvedilol)</span>
              <span className="w-3.5 h-3.5 rounded-full border border-[#CBD5E1]" />
            </div>
          </div>

          {/* Clinical note */}
          <div className="p-2.5 rounded-lg bg-white border border-teal-200/80 text-[11px] text-[#3d4f55] flex items-start gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#008080] shrink-0 mt-0.5" />
            <span>
              <strong>توضیح پاسخ:</strong> متوپرولول به طور انتخابی گیرنده‌های بتا-۱ قلبی را مهار کرده و عوارض برونکواسپاسم کمتری دارد.
            </span>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

/**
 * Preview 3: Assignments & Feedback Roster
 */
export function AssignmentsPreview() {
  return (
    <AppWindow title="سامانه استاد • تکالیف و ثبت نمره" badgeText="بررسی پاسخ‌ها">
      <div className="space-y-3.5">
        {/* Assignment Progress Top Card */}
        <div className="p-3.5 rounded-xl bg-[#F7F9FA] border border-[#E2E7EA] space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#008080]" />
              <h4 className="text-xs sm:text-sm font-bold text-[#1a2226]">
                تحلیل بالینی: فارماکوکینتیک داروهای آنتی‌بیوتیک
              </h4>
            </div>
            <Badge variant="info" size="sm">
              مهلت: ۲۵ مهر
            </Badge>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#5B6268]">وضعیت ارسال تکالیف:</span>
              <span className="font-bold text-[#008080]">۲۴ از ۲۸ ارسال شده (۸۶٪)</span>
            </div>
            <Progress value={86} max={100} size="sm" variant="primary" />
          </div>
        </div>

        {/* Student Submission Review Item */}
        <div className="p-3.5 rounded-xl border border-[#E2E7EA] bg-white space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#E2E7EA] text-xs">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-teal-50 text-[#008080] font-bold text-[10px] flex items-center justify-center">
                م
              </div>
              <span className="font-bold text-[#1a2226]">پاسخ دانشجو: مهسا راد</span>
            </div>
            <span className="text-[10px] text-[#5B6268]">ارسال شده: ۲۳ مهر ساعت ۱۸:۳۰</span>
          </div>

          <div className="p-2.5 rounded-lg bg-[#F7F9FA] text-xs text-[#3d4f55] leading-relaxed border border-[#E2E7EA]">
            «در بیمار مبتلا به نارسایی کلیوی، دوز اولیه آمینوگلیکوزیدها بر اساس حجم توزیع تغییر نکرده اما فاصله دوزها باید مطابق کلیرانس کراتینین افزایش یابد...»
          </div>

          {/* Teacher Scoring Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#5B6268]">ثبت نمره:</span>
              <span className="px-2.5 py-1 rounded-md bg-teal-50 border border-teal-200 text-xs font-bold text-[#008080]">
                ۱۹ از ۲۰
              </span>
            </div>

            <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#008080] text-white shadow-2xs">
              <Check className="w-3.5 h-3.5" />
              <span>ثبت بازخورد و نمره</span>
            </div>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}

/**
 * Preview 4: Exam Analytics & Score Distribution
 */
export function ResultsPreview() {
  return (
    <AppWindow title="سامانه استاد • تحلیل کارنامه‌ها و نمودار نتایج" badgeText="گزارش تحلیلی">
      <div className="space-y-3.5">
        {/* Key Operational KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="p-2.5 rounded-xl bg-[#F7F9FA] border border-[#E2E7EA]">
            <div className="text-[10px] text-[#5B6268] flex items-center gap-1 mb-0.5">
              <Users className="w-3 h-3 text-[#008080]" />
              <span>شرکت‌کنندگان</span>
            </div>
            <div className="text-base font-black text-[#1a2226]">۲۸ نفر</div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#F7F9FA] border border-[#E2E7EA]">
            <div className="text-[10px] text-[#5B6268] flex items-center gap-1 mb-0.5">
              <TrendingUp className="w-3 h-3 text-sky-600" />
              <span>میانگین نمرات</span>
            </div>
            <div className="text-base font-black text-[#1a2226]">۱۷.۴ <span className="text-[10px] font-normal text-[#5B6268]">از ۲۰</span></div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#F7F9FA] border border-[#E2E7EA]">
            <div className="text-[10px] text-[#5B6268] flex items-center gap-1 mb-0.5">
              <Award className="w-3 h-3 text-emerald-600" />
              <span>درصد قبولی</span>
            </div>
            <div className="text-base font-black text-emerald-600">۸۹٪</div>
          </div>

          <div className="p-2.5 rounded-xl bg-[#F7F9FA] border border-[#E2E7EA]">
            <div className="text-[10px] text-[#5B6268] flex items-center gap-1 mb-0.5">
              <FileCheck2 className="w-3 h-3 text-purple-600" />
              <span>بالاترین نمره</span>
            </div>
            <div className="text-base font-black text-purple-700">۲۰.۰</div>
          </div>
        </div>

        {/* Score Distribution Bars */}
        <div className="p-3 rounded-xl border border-[#E2E7EA] bg-white space-y-2">
          <div className="flex items-center justify-between text-xs pb-1.5 border-b border-[#E2E7EA]">
            <span className="font-bold text-[#1a2226] flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5 text-[#008080]" />
              <span>توزیع نمرات کلاس</span>
            </span>
            <span className="text-[10px] text-[#5B6268]">حد نصاب قبولی: ۱۴</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-[#F7F9FA] border border-[#E2E7EA] space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold text-[#1a2226]">۸۵ تا ۱۰۰٪ (عالی)</span>
                <span className="font-bold text-emerald-700">۱۶ نفر (۵۷٪)</span>
              </div>
              <Progress value={57} max={100} size="sm" variant="success" />
            </div>

            <div className="p-2 rounded-lg bg-[#F7F9FA] border border-[#E2E7EA] space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="font-semibold text-[#1a2226]">۷۰ تا ۸۴٪ (خوب)</span>
                <span className="font-bold text-[#008080]">۹ نفر (۳۲٪)</span>
              </div>
              <Progress value={32} max={100} size="sm" variant="secondary" />
            </div>
          </div>
        </div>
      </div>
    </AppWindow>
  );
}
