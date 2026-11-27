import { History } from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Alert,
} from "../../ui/index.js";
import { AdminStatusBadge, AdminLoadingState, AdminEmptyState } from "../AdminUI.js";
import { usePocketReviewerCredentialEvents } from "../../../hooks/usePocketReviewerCredentials.js";
import type {
  ClinicalReviewerCredential,
  ReviewerCredentialEventType,
} from "../../../lib/api/pocket.js";
import { formatPersianExamDate } from "../../../utils/date.js";

const EVENT_LABELS: Record<ReviewerCredentialEventType, string> = {
  granted: "اعطای اعتبارنامه",
  suspended: "تعلیق موقت",
  reactivated: "فعال‌سازی مجدد",
  revoked: "لغو دائم",
};

const EVENT_COLORS: Record<string, string> = {
  "اعطای اعتبارنامه": "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20",
  "تعلیق موقت": "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20",
  "فعال‌سازی مجدد": "text-sky-600 dark:text-sky-300 bg-sky-500/10 border-sky-500/20",
  "لغو دائم": "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/20",
};

export interface CredentialEventsModalProps {
  credential: ClinicalReviewerCredential | null;
  onClose: () => void;
}

export function CredentialEventsModal({ credential, onClose }: CredentialEventsModalProps) {
  const isOpen = Boolean(credential);
  const { data: events = [], isLoading, isError, error } = usePocketReviewerCredentialEvents(
    credential?.id,
    isOpen,
  );

  return (
    <Dialog isOpen={isOpen} onClose={onClose} maxWidth="lg">
      <DialogHeader onClose={onClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              تاریخچه رویدادهای اعتبارنامه
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono" dir="ltr">
              {credential?.medicalLicenseNumber}
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="space-y-3 max-h-[60vh] overflow-y-auto">
        {isLoading ? (
          <div className="py-6">
            <table>
              <tbody>
                <AdminLoadingState colSpan={1} />
              </tbody>
            </table>
          </div>
        ) : isError ? (
          <Alert variant="error" title="خطا در دریافت تاریخچه">
            <span className="text-xs sm:text-sm">
              {error instanceof Error ? error.message : "دریافت رویدادهای اعتبارنامه ناموفق بود."}
            </span>
          </Alert>
        ) : events.length === 0 ? (
          <table>
            <tbody>
              <AdminEmptyState message="هیچ رویداد ثبت‌شده‌ای برای این اعتبارنامه یافت نشد." />
            </tbody>
          </table>
        ) : (
          <div className="space-y-2.5">
            {events.map((ev) => {
              const label = EVENT_LABELS[ev.eventType] ?? ev.eventType;
              return (
                <div
                  key={ev.id}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/40 p-3 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <AdminStatusBadge status={label} colorMap={EVENT_COLORS} />
                    <span className="text-[var(--color-text-muted)] whitespace-nowrap">
                      {toPersianDigits(formatPersianExamDate(ev.createdAt))}
                    </span>
                  </div>
                  <div className="text-[var(--color-text-muted)] font-mono text-[11px]" dir="ltr">
                    Actor: {ev.actorUserId}
                  </div>
                  {ev.reason && (
                    <div className="text-[var(--color-text)] leading-relaxed pt-0.5">
                      {ev.reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>

      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          بستن
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
