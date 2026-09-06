import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  Sparkles,
  BookOpen,
  FolderTree,
  User,
  CheckCircle2,
  AlertCircle,
  X,
  Clock,
  Infinity as InfinityIcon,
} from "lucide-react";
import type { AdminUserRecord, AdminCourseRecord } from "../../../lib/api/admin.js";

interface AdminGrantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  defaultUserId?: string;
  defaultUserEmail?: string;
}

export function AdminGrantModal({
  isOpen,
  onClose,
  onSuccess,
  defaultUserId,
  defaultUserEmail,
}: AdminGrantModalProps) {
  const adminApi = useAdmin();

  const [resourceType, setResourceType] = useState<"subscription" | "course" | "content_pack">("subscription");
  const [selectedUserId, setSelectedUserId] = useState<string>(defaultUserId || "");
  const [userSearchQuery, setUserSearchQuery] = useState<string>(defaultUserEmail || "");
  const [userSearchResults, setUserSearchResults] = useState<AdminUserRecord[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);

  const [selectedResourceId, setSelectedResourceId] = useState<string>("");
  const [availableCourses, setAvailableCourses] = useState<AdminCourseRecord[]>([]);
  const [availablePacks, setAvailablePacks] = useState<Array<{ id: string; title: string }>>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(false);

  const [durationDays, setDurationDays] = useState<number>(30);
  const [customDuration, setCustomDuration] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (defaultUserId) {
      setSelectedUserId(defaultUserId);
      if (defaultUserEmail) setUserSearchQuery(defaultUserEmail);
    }
  }, [defaultUserId, defaultUserEmail]);

  useEffect(() => {
    if (!isOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
      return;
    }

    // Load available courses and products for selection
    const loadResources = async () => {
      setIsLoadingResources(true);
      try {
        const [coursesRes, productsRes] = await Promise.all([
          adminApi.listCourses(1, 100),
          adminApi.listCommerceProducts(),
        ]);
        setAvailableCourses(coursesRes.courses);

        const packs = productsRes.products
          .filter((p) => p.type === "content_pack" && p.targetId)
          .map((p) => ({ id: p.targetId!, title: p.targetTitle || p.title }));
        setAvailablePacks(packs);
      } catch (err) {
        console.error("Failed to load grant resources:", err);
      } finally {
        setIsLoadingResources(false);
      }
    };

    loadResources();
  }, [isOpen]);

  // Debounced user search
  useEffect(() => {
    if (!userSearchQuery || selectedUserId || defaultUserId) {
      setUserSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingUsers(true);
      try {
        const res = await adminApi.listUsers(1, 5, userSearchQuery);
        setUserSearchResults(res.users);
      } catch (err) {
        console.error("User search failed:", err);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [userSearchQuery, selectedUserId, defaultUserId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedUserId) {
      setErrorMsg("لطفاً یک کاربر را انتخاب کنید.");
      return;
    }

    if ((resourceType === "course" || resourceType === "content_pack") && !selectedResourceId) {
      setErrorMsg("لطفاً منبع آموزشی مورد نظر را انتخاب کنید.");
      return;
    }

    const finalDuration = customDuration ? parseInt(customDuration, 10) : durationDays;
    if (resourceType === "subscription" && (!finalDuration || finalDuration < 1)) {
      setErrorMsg("مدت زمان اشتراک باید حداقل ۱ روز باشد.");
      return;
    }

    setIsSubmitting(true);
    try {
      await adminApi.grantCommerceEntitlement({
        userId: selectedUserId,
        resourceType,
        resourceId: resourceType === "subscription" ? null : selectedResourceId,
        durationDays: resourceType === "subscription" ? finalDuration : undefined,
      });

      setSuccessMsg("دسترسی با موفقیت به کاربر اعطا شد.");
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err.message || "خطا در اعطای دسترسی.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-800/40">
          <div className="flex items-center gap-2 text-teal-400 font-bold text-lg">
            <Sparkles className="w-5 h-5" />
            <span>اعطای دسترسی مستقیم ادمین (Admin Grant)</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* 1. Target User */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              کاربر هدف <span className="text-teal-400">*</span>
            </label>
            {defaultUserId ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/60 border border-slate-700 text-slate-200 text-sm">
                <User className="w-4 h-4 text-teal-400" />
                <span>{defaultUserEmail || defaultUserId}</span>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="جستجوی ایمیل یا نام کاربر..."
                  value={userSearchQuery}
                  onChange={(e) => {
                    setUserSearchQuery(e.target.value);
                    setSelectedUserId("");
                  }}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
                {isSearchingUsers && (
                  <span className="absolute left-3 top-3 text-xs text-slate-400">
                    در حال جستجو...
                  </span>
                )}
                {userSearchResults.length > 0 && !selectedUserId && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden divide-y divide-white/5">
                    {userSearchResults.map((u) => (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() => {
                          setSelectedUserId(u.id);
                          setUserSearchQuery(u.email);
                          setUserSearchResults([]);
                        }}
                        className="w-full text-right px-4 py-2.5 text-sm text-slate-200 hover:bg-slate-700/60 flex items-center justify-between"
                      >
                        <span>{u.email}</span>
                        {u.name && <span className="text-xs text-slate-400">{u.name}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 2. Grant Resource Type */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              نوع دسترسی <span className="text-teal-400">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setResourceType("subscription")}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                  resourceType === "subscription"
                    ? "border-teal-500 bg-teal-500/10 text-teal-300"
                    : "border-slate-700 bg-slate-800/40 text-slate-400 hover:bg-slate-800"
                }`}
              >
                <Sparkles className="w-5 h-5" />
                <span>اشتراک سراسری</span>
              </button>

              <button
                type="button"
                onClick={() => setResourceType("course")}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                  resourceType === "course"
                    ? "border-teal-500 bg-teal-500/10 text-teal-300"
                    : "border-slate-700 bg-slate-800/40 text-slate-400 hover:bg-slate-800"
                }`}
              >
                <BookOpen className="w-5 h-5" />
                <span>دوره آموزشی</span>
              </button>

              <button
                type="button"
                onClick={() => setResourceType("content_pack")}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                  resourceType === "content_pack"
                    ? "border-teal-500 bg-teal-500/10 text-teal-300"
                    : "border-slate-700 bg-slate-800/40 text-slate-400 hover:bg-slate-800"
                }`}
              >
                <FolderTree className="w-5 h-5" />
                <span>بسته محتوایی</span>
              </button>
            </div>
          </div>

          {/* 3. Resource Selector (if Course or Pack) */}
          {resourceType === "course" && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                انتخاب دوره آموزشی <span className="text-teal-400">*</span>
              </label>
              <select
                value={selectedResourceId}
                onChange={(e) => setSelectedResourceId(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
              >
                <option value="">-- انتخاب دوره --</option>
                {availableCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.subject ? `(${c.subject})` : ""}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                <InfinityIcon className="w-3.5 h-3.5 text-purple-400" />
                <span>دسترسی به دوره‌ها به صورت دائمی (مادام‌العمر) اعطا می‌شود.</span>
              </p>
            </div>
          )}

          {resourceType === "content_pack" && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                انتخاب بسته آموزشی <span className="text-teal-400">*</span>
              </label>
              <select
                value={selectedResourceId}
                onChange={(e) => setSelectedResourceId(e.target.value)}
                className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
              >
                <option value="">-- انتخاب بسته --</option>
                {availablePacks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                <InfinityIcon className="w-3.5 h-3.5 text-purple-400" />
                <span>دسترسی به بسته‌ها به صورت دائمی (مادام‌العمر) اعطا می‌شود.</span>
              </p>
            </div>
          )}

          {/* 4. Duration Selector (if Subscription) */}
          {resourceType === "subscription" && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                مدت زمان اشتراک <span className="text-teal-400">*</span>
              </label>
              <div className="grid grid-cols-4 gap-2 mb-2.5">
                {[
                  { label: "۷ روز", days: 7 },
                  { label: "۳۰ روز", days: 30 },
                  { label: "۹۰ روز", days: 90 },
                  { label: "۳۶۵ روز", days: 365 },
                ].map((item) => (
                  <button
                    type="button"
                    key={item.days}
                    onClick={() => {
                      setDurationDays(item.days);
                      setCustomDuration("");
                    }}
                    className={`py-2 rounded-xl border text-xs font-medium transition-colors ${
                      durationDays === item.days && !customDuration
                        ? "border-teal-500 bg-teal-500/10 text-teal-300"
                        : "border-slate-700 bg-slate-800/40 text-slate-400 hover:bg-slate-800"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  placeholder="مدت دلخواه (تعداد روز)"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  className="w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
                />
                <span className="text-xs text-slate-400 whitespace-nowrap">روز</span>
              </div>
              <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-teal-400" />
                <span>در صورت داشتن اشتراک فعال قبلی، مدت زمان جدید به انقضای فعلی اضافه خواهد شد.</span>
              </p>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isLoadingResources}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isSubmitting ? "در حال اعطا..." : "اعطای دسترسی"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
