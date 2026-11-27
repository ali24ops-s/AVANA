import { History, Loader2 } from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
} from "../../ui/index.js";
import { AdminStatusBadge } from "../AdminUI.js";
import { usePocketSafetyOverride } from "../../../hooks/usePocketSafetyOverrides.js";
import { formatPersianExamDateTime } from "../../../utils/date.js";

const OVERRIDE_STATUS_COLOR_MAP: Record<string, string> = {
  فعال: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
  پاک‌شده: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  activated: "فعال‌سازی",
  cleared: "پاک‌سازی",
};

export interface SafetyOverrideDetailModalProps {
  overrideId: string | null;
  onClose: () => void;
}

export function SafetyOverrideDetailModal({
  overrideId,
  onClose,
}: SafetyOverrideDetailModalProps) {
  const { data, isLoading, isError, error } = usePocketSafetyOverride(overrideId);
  const isOpen = Boolean(overrideId);

  const errorMessage =
    error instanceof Error ? error.message : "خطا در دریافت جزئیات و تاریخچه رویدادها";

  return (
    <Dialog isOpen={isOpen} onClose={onClose} maxWidth="lg">
      <DialogHeader onClose={onClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] flex items-center justify-center shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              جزئیات و تاریخچه رویدادهای Safety Override
            </h2>
            {overrideId && (
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono" dir="ltr">
                {overrideId}
              </p>
            )}
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="space-y-5">
        {isLoading ? (
          <div className="py-10 flex flex-col items-center justify-center gap-2 text-[var(--color-text-muted)]">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary-default)]" />
            <span className="text-xs sm:text-sm">در حال بارگذاری جزئیات...</span>
          </div>
        ) : isError ? (
          <Alert variant="error" title="خطا">
            <span className="text-xs sm:text-sm">{errorMessage}</span>
          </Alert>
        ) : !data ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">
            اطلاعاتی یافت نشد.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-[var(--color-surface-warm)]/60 border border-[var(--color-border)] text-xs">
              <div>
                <span className="text-[var(--color-text-muted)] block mb-1">نوع موجودیت هدف</span>
                <span className="font-bold text-[var(--color-text)]">
                  {data.override.targetEntityType}
                </span>
              </div>
              <div>
                <span className="text-[var(--color-text-muted)] block mb-1">وضعیت فعلی</span>
                <AdminStatusBadge
                  status={data.override.isActive ? "فعال" : "پاک‌شده"}
                  colorMap={OVERRIDE_STATUS_COLOR_MAP}
                />
              </div>
              <div className="sm:col-span-2">
                <span className="text-[var(--color-text-muted)] block mb-1">شناسه هدف</span>
                <span className="font-mono text-[var(--color-text)] break-all" dir="ltr">
                  {data.override.targetEntityId}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
                تاریخچه رویدادها ({toPersianDigits(data.events.length)})
              </h3>
              {data.events.length === 0 ? (
                <p className="text-xs text-[var(--color-text-muted)] py-4 text-center border border-dashed border-[var(--color-border)] rounded-xl">
                  رویدادی ثبت نشده است.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {data.events.map((ev) => (
                    <div
                      key={ev.id}
                      className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <AdminStatusBadge
                          status={ev.eventType === "activated" ? "فعال" : "پاک‌شده"}
                          colorMap={OVERRIDE_STATUS_COLOR_MAP}
                        />
                        <span className="font-bold text-[var(--color-text)]">
                          {EVENT_TYPE_LABELS[ev.eventType] ?? ev.eventType}
                        </span>
                        <span className="text-[var(--color-text-muted)]">
                          {toPersianDigits(formatPersianExamDateTime(ev.eventTimestamp))}
                        </span>
                      </div>
                      <p className="text-[var(--color-text)] leading-relaxed">{ev.reason}</p>
                      <div className="text-[11px] text-[var(--color-text-muted)] font-mono" dir="ltr">
                        Actor: {ev.actorUserId}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>

      <DialogFooter>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          بستن
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
