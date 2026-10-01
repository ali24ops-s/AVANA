/**
 * TeacherOrgSwitcher component.
 *
 * Scoped organization switcher for platform_admin in the Teacher Platform.
 *
 * Adheres strictly to AVANA tokens:
 *  - Light-first design
 *  - RTL layout
 *  - Primary: #008080
 *  - Border: #E2E7EA
 *  - Lucide icons only (no Material Symbols)
 */

import { useState, useRef, useEffect } from "react";
import { Building2, ChevronDown, Check, AlertCircle } from "lucide-react";
import { useTeacherOrganization } from "./TeacherOrganizationContext.js";
import { Badge } from "../ui/index.js";

interface TeacherOrgSwitcherProps {
  isMobile?: boolean;
}

export function TeacherOrgSwitcher({ isMobile = false }: TeacherOrgSwitcherProps) {
  const {
    isPlatformAdmin,
    availableOrgs,
    selectedOrgId,
    selectedOrg,
    isLoadingOrgs,
    needsOrgSelection,
    hasNoOrganizations,
    setSelectedOrgId,
  } = useTeacherOrganization();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Only platform_admin sees the switcher
  if (!isPlatformAdmin) {
    return null;
  }

  if (isLoadingOrgs) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text-muted)] animate-pulse">
        <Building2 className="w-3.5 h-3.5" />
        <span>در حال بارگذاری سازمان‌ها...</span>
      </div>
    );
  }

  if (hasNoOrganizations) {
    return (
      <Badge
        variant="neutral"
        size="sm"
        icon={<Building2 className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />}
      >
        <span>بدون سازمان فعال</span>
      </Badge>
    );
  }

  // Exactly 1 organization: render deterministic indicator, not a redundant dropdown
  if (availableOrgs.length === 1) {
    return (
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-semibold text-[var(--color-text)] shrink-0"
        title="تنها سازمان موجود در سیستم"
      >
        <Building2 className="w-3.5 h-3.5 text-[#008080] shrink-0" />
        <span className="truncate max-w-[140px] sm:max-w-[200px]">
          {selectedOrg?.name || availableOrgs[0].name}
        </span>
      </div>
    );
  }

  // Multiple organizations: interactive switcher
  return (
    <div className={`relative ${isMobile ? "w-full" : "shrink-0"}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        className={`flex items-center justify-between gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all border cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#008080]/30 ${
          isMobile ? "w-full" : "max-w-[220px]"
        } ${
          needsOrgSelection
            ? "border-amber-400 bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-2 ring-amber-400/30"
            : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:border-[#008080]"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {needsOrgSelection ? (
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          ) : (
            <Building2 className="w-3.5 h-3.5 text-[#008080] shrink-0" />
          )}
          <span className="truncate">
            {selectedOrg?.name || "انتخاب سازمان..."}
          </span>
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--color-text-muted)] shrink-0 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div
          role="listbox"
          aria-label="فهرست سازمان‌های در دسترس"
          className="absolute start-0 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xl z-50 overflow-hidden flex flex-col py-1.5 transition-all animate-in fade-in zoom-in-95 duration-150 text-start"
          dir="rtl"
        >
          <div className="px-3.5 py-2 border-b border-[var(--color-border)] mb-1 bg-[var(--color-surface-warm)]/50">
            <span className="text-[11px] font-bold text-[var(--color-text-muted)] block">
              تغییر سازمان فعال
            </span>
            <span className="text-[10px] text-[var(--color-text-muted)]">
              کلاس‌ها و آزمون‌های سازمان انتخاب‌شده نمایش داده می‌شوند.
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {availableOrgs.map((org) => {
              const isSelected = org.id === selectedOrgId;

              return (
                <button
                  key={org.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    setSelectedOrgId(org.id);
                    setIsOpen(false);
                  }}
                  className={`flex items-center justify-between gap-2 px-3.5 py-2 text-xs font-medium w-full text-start transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-[#008080]/10 text-[#008080] font-bold"
                      : "text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] hover:text-[#008080]"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-[#008080]" : "text-[var(--color-text-muted)]"}`} />
                    <span className="truncate">{org.name}</span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-[#008080] shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
