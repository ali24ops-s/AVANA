import React, { useEffect, useState, useRef } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "../../hooks/useOnlineStatus.js";

export interface OfflineBannerProps {
  className?: string;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ className = "" }) => {
  const isOnline = useOnlineStatus();
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setShowRestoredNotice(false);
    } else if (wasOfflineRef.current) {
      // Transitioned from offline to online
      setShowRestoredNotice(true);
      const timer = setTimeout(() => {
        setShowRestoredNotice(false);
        wasOfflineRef.current = false;
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (isOnline && !showRestoredNotice) {
    return null;
  }

  if (showRestoredNotice) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`w-full bg-[#e4f4ec] text-[#235843] border-b border-[#9ed4bb] px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 select-none shadow-xs sticky top-0 z-50 transition-all ${className}`}
        dir="rtl"
      >
        <Wifi className="w-4 h-4 text-[#3d8f6e] shrink-0" />
        <span>اتصال به اینترنت مجدداً برقرار شد.</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`w-full bg-[#fdf2e4] text-[#784d1b] border-b border-[#e8c18a] px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 select-none shadow-xs sticky top-0 z-50 transition-all ${className}`}
      dir="rtl"
    >
      <WifiOff className="w-4 h-4 text-[#c2853f] shrink-0" />
      <span>ارتباط شما با اینترنت قطع شده است. در حال کار در حالت آفلاین هستید.</span>
    </div>
  );
};
