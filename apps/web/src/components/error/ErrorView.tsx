import React, { useEffect } from "react";
import { Link, useNavigate, useInRouterContext, BrowserRouter } from "react-router-dom";
import { Home, ArrowRight, RefreshCw, LifeBuoy } from "lucide-react";
import { Button } from "@avana/ui";
import { BrandLogo } from "../brand/BrandLogo.js";
import { AvaniVector, type AvaniPose } from "../brand/AvaniVector.js";

export type ErrorType = "404" | "500" | "offline" | "forbidden" | "general";

export interface ActionConfig {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: React.ReactNode;
}

export interface ErrorViewProps {
  type?: ErrorType;
  statusCode?: string | number;
  title?: string;
  description?: string;
  illustration?: React.ReactNode;
  avaniPose?: AvaniPose;
  primaryAction?: ActionConfig | null;
  secondaryAction?: ActionConfig | null;
  supportLink?: { label: string; href: string } | null;
  compact?: boolean;
  className?: string;
}

/**
 * Smart back navigation hook.
 * Checks if the browser has a legitimate previous internal history entry in this session.
 * If not (direct URL entry, fresh tab, or external referrer), safely falls back to a safe route.
 */
export function useSmartBack(fallbackPath = "/") {
  const navigate = useNavigate();

  return React.useCallback(() => {
    if (typeof window !== "undefined") {
      const historyState = window.history.state;
      const hasPreviousSpaRoute =
        typeof historyState?.idx === "number" && historyState.idx > 0;

      if (hasPreviousSpaRoute) {
        navigate(-1);
        return;
      }

      if (document.referrer) {
        try {
          const refUrl = new URL(document.referrer);
          if (
            refUrl.origin === window.location.origin &&
            refUrl.pathname !== window.location.pathname
          ) {
            navigate(-1);
            return;
          }
        } catch {
          // ignore parsing error
        }
      }
    }
    navigate(fallbackPath, { replace: true });
  }, [navigate, fallbackPath]);
}

const DEFAULT_CONFIGS: Record<
  ErrorType,
  {
    statusCode?: string;
    title: string;
    description: string;
    avaniPose: AvaniPose;
    documentTitle: string;
  }
> = {
  "404": {
    statusCode: "۴۰۴",
    title: "اینجا چیزی برای پیدا کردن نیست!",
    description: "صفحه‌ای که دنبالش هستی پیدا نشد. شاید آدرس اشتباه باشه یا این صفحه جابه‌جا شده باشه.",
    avaniPose: "confused",
    documentTitle: "صفحه پیدا نشد | آوانا",
  },
  "500": {
    statusCode: "۵۰۰",
    title: "خطایی غیرمنتظره در سرور رخ داد",
    description: "متأسفانه در پردازش این بخش مشکلی پیش آمده است. لطفاً چند لحظه بعد دوباره امتحان کنید.",
    avaniPose: "thinking",
    documentTitle: "خطای سرور | آوانا",
  },
  "offline": {
    title: "ارتباط با اینترنت برقرار نیست",
    description: "به نظر می‌رسد دسترسی شما به شبکه قطع شده است. اتصال اینترنت خود را بررسی کنید.",
    avaniPose: "sleeping",
    documentTitle: "عدم اتصال به شبکه | آوانا",
  },
  "forbidden": {
    statusCode: "۴۰۳",
    title: "دسترسی به این صفحه محدود است",
    description: "حساب کاربری شما مجوز لازم برای مشاهده این بخش را ندارد.",
    avaniPose: "confused",
    documentTitle: "عدم دسترسی | آوانا",
  },
  "general": {
    title: "مشکلی در بارگذاری رخ داده است",
    description: "در بارگذاری این بخش خطایی رخ داده است. می‌توانید دوباره تلاش کنید یا به صفحه اصلی برگردید.",
    avaniPose: "thinking",
    documentTitle: "خطای سیستم | آوانا",
  },
};

const ErrorViewContent: React.FC<ErrorViewProps> = ({
  type = "404",
  statusCode,
  title,
  description,
  illustration,
  avaniPose,
  primaryAction,
  secondaryAction,
  supportLink,
  compact = false,
  className = "",
}) => {
  const navigate = useNavigate();
  const handleSmartBack = useSmartBack("/");

  const config = DEFAULT_CONFIGS[type] || DEFAULT_CONFIGS["general"];
  const displayStatusCode = statusCode !== undefined ? String(statusCode) : config.statusCode;
  const displayTitle = title || config.title;
  const displayDescription = description || config.description;
  const displayPose = avaniPose || config.avaniPose;

  // Manage SEO document title and noindex meta tag for full-page error displays
  useEffect(() => {
    if (compact || typeof document === "undefined") return;

    const previousTitle = document.title;
    document.title = config.documentTitle;

    // Attach noindex, nofollow meta tag
    let metaTag = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    let created = false;
    if (!metaTag) {
      metaTag = document.createElement("meta");
      metaTag.setAttribute("name", "robots");
      document.head.appendChild(metaTag);
      created = true;
    }
    const previousContent = metaTag.getAttribute("content");
    metaTag.setAttribute("content", "noindex, nofollow");

    return () => {
      document.title = previousTitle;
      if (created) {
        metaTag?.remove();
      } else if (previousContent !== null && metaTag) {
        metaTag.setAttribute("content", previousContent);
      }
    };
  }, [compact, config.documentTitle]);

  // Default primary action: Go home or retry
  const resolvedPrimaryAction: ActionConfig | null =
    primaryAction === undefined
      ? type === "500" || type === "offline"
        ? {
            label: "تلاش مجدد",
            onClick: () => {
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            },
            icon: <RefreshCw className="w-4 h-4 ml-1.5" />,
          }
        : {
            label: "رفتن به صفحه اصلی",
            onClick: () => navigate("/"),
            icon: <Home className="w-4 h-4 ml-1.5" />,
          }
      : primaryAction;

  // Default secondary action: Smart back navigation
  const resolvedSecondaryAction: ActionConfig | null =
    secondaryAction === undefined
      ? {
          label: "بازگشت به صفحه قبل",
          onClick: handleSmartBack,
          icon: <ArrowRight className="w-4 h-4 ml-1.5" />,
        }
      : secondaryAction;

  // Default support link
  const resolvedSupportLink =
    supportLink === undefined
      ? {
          label: "نیاز به راهنمایی داری؟ ارتباط با پشتیبانی",
          href: "/account/support",
        }
      : supportLink;

  // Compact inline representation (for embedding inside specific widgets/sections)
  if (compact) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-6 text-center rounded-2xl bg-[#FFFFFF] border border-[#E2E7EA] shadow-xs ${className}`}
        dir="rtl"
      >
        <div className="relative mb-3 flex items-center justify-center">
          {illustration || (
            <AvaniVector pose={displayPose} size={72} className="drop-shadow-xs" />
          )}
        </div>
        {displayStatusCode && (
          <span className="text-xs font-bold text-[#008080] tracking-wider mb-1 font-sans">
            {displayStatusCode}
          </span>
        )}
        <h3 className="text-base font-bold text-[#1a2226] mb-1.5">{displayTitle}</h3>
        <p className="text-xs text-[#5B6268] max-w-sm mb-4 leading-relaxed">
          {displayDescription}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {resolvedPrimaryAction && (
            <Button
              variant="primary"
              size="sm"
              onClick={resolvedPrimaryAction.onClick}
            >
              {resolvedPrimaryAction.icon}
              {resolvedPrimaryAction.label}
            </Button>
          )}
          {resolvedSecondaryAction && (
            <Button
              variant="tertiary"
              size="sm"
              onClick={resolvedSecondaryAction.onClick}
            >
              {resolvedSecondaryAction.icon}
              {resolvedSecondaryAction.label}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // Full-page error layout
  return (
    <div
      className={`min-h-screen flex flex-col bg-[#F7F9FA] text-[#1a2226] select-none ${className}`}
      dir="rtl"
    >
      {/* Minimal Header with official Brand Logo */}
      <header className="w-full border-b border-[#E2E7EA] bg-[#FFFFFF]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <BrandLogo
            variant="responsive"
            size="md"
            linkTo="/"
            className="hover:opacity-90 transition-opacity"
          />
          {resolvedSupportLink && (
            <Link
              to={resolvedSupportLink.href}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5B6268] hover:text-[#008080] transition-colors"
            >
              <LifeBuoy className="w-4 h-4 text-[#008080]" />
              <span className="hidden sm:inline">پشتیبانی</span>
            </Link>
          )}
        </div>
      </header>

      {/* Main Centered Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-14">
        <div className="w-full max-w-xl mx-auto bg-[#FFFFFF] rounded-3xl border border-[#E2E7EA] p-6 sm:p-10 shadow-[0_4px_24px_rgba(0,0,0,0.03)] text-center transition-all">
          {/* Illustration Container with subtle geometric backdrop */}
          <div className="relative mx-auto mb-6 w-36 h-36 sm:w-44 sm:h-44 flex items-center justify-center">
            {/* Soft decorative background circles with brand colors */}
            <div
              className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#e0f2f2] via-[#e8f4fb] to-[#F0E6D2]/60 opacity-80 blur-xs"
              aria-hidden="true"
            />
            <div
              className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-[#A7D0E6]/40"
              aria-hidden="true"
            />
            <div
              className="absolute -bottom-2 -left-2 w-8 h-8 rounded-full bg-[#F0E6D2]/60"
              aria-hidden="true"
            />

            {/* Avani Mascot */}
            <div className="relative z-1 flex items-center justify-center">
              {illustration || (
                <AvaniVector
                  pose={displayPose}
                  size={120}
                  className="sm:scale-115 drop-shadow-[0_8px_16px_rgba(0,128,128,0.12)] transition-transform"
                />
              )}
            </div>
          </div>

          {/* Status Code (e.g. 404 / 500) */}
          {displayStatusCode && (
            <div className="mb-2">
              <span className="inline-block px-3.5 py-1 rounded-full text-xs sm:text-sm font-bold bg-[#e0f2f2] text-[#008080] border border-[#b3d9d9]/60 tracking-wider font-sans">
                کد {displayStatusCode}
              </span>
            </div>
          )}

          {/* Heading */}
          <h1 className="text-xl sm:text-2xl font-black text-[#1a2226] mb-3 leading-snug">
            {displayTitle}
          </h1>

          {/* Description */}
          <p className="text-xs sm:text-sm text-[#5B6268] max-w-md mx-auto mb-8 leading-relaxed font-normal">
            {displayDescription}
          </p>

          {/* Primary & Secondary Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-center gap-3 max-w-sm mx-auto">
            {resolvedSecondaryAction && (
              resolvedSecondaryAction.href ? (
                <Link
                  to={resolvedSecondaryAction.href}
                  className="inline-flex items-center justify-center h-10 px-5 text-xs sm:text-sm font-semibold rounded-xl bg-[#F7F9FA] hover:bg-[#EEF1F3] text-[#1a2226] border border-[#E2E7EA] transition-colors"
                >
                  {resolvedSecondaryAction.icon}
                  <span>{resolvedSecondaryAction.label}</span>
                </Link>
              ) : (
                <Button
                  variant="tertiary"
                  size="md"
                  onClick={resolvedSecondaryAction.onClick}
                  className="h-10 px-5 text-xs sm:text-sm rounded-xl"
                >
                  {resolvedSecondaryAction.icon}
                  <span>{resolvedSecondaryAction.label}</span>
                </Button>
              )
            )}

            {resolvedPrimaryAction && (
              resolvedPrimaryAction.href ? (
                <Link
                  to={resolvedPrimaryAction.href}
                  className="inline-flex items-center justify-center h-10 px-6 text-xs sm:text-sm font-semibold rounded-xl bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-xs transition-colors"
                >
                  {resolvedPrimaryAction.icon}
                  <span>{resolvedPrimaryAction.label}</span>
                </Link>
              ) : (
                <Button
                  variant="primary"
                  size="md"
                  onClick={resolvedPrimaryAction.onClick}
                  className="h-10 px-6 text-xs sm:text-sm rounded-xl"
                >
                  {resolvedPrimaryAction.icon}
                  <span>{resolvedPrimaryAction.label}</span>
                </Button>
              )
            )}
          </div>

          {/* Subtle Support Link at Bottom */}
          {resolvedSupportLink && (
            <div className="mt-8 pt-6 border-t border-[#EEF1F3]">
              <Link
                to={resolvedSupportLink.href}
                className="text-xs text-[#5B6268] hover:text-[#008080] underline-offset-4 hover:underline transition-colors"
              >
                {resolvedSupportLink.label}
              </Link>
            </div>
          )}
        </div>
      </main>

      {/* Subtle clean footer note */}
      <footer className="w-full py-4 text-center text-[11px] text-[#5B6268]/70">
        آوانا — همراه هوشمند یادگیری شما
      </footer>
    </div>
  );
};

export const ErrorView: React.FC<ErrorViewProps> = (props) => {
  const inRouter = useInRouterContext();
  if (!inRouter) {
    return (
      <BrowserRouter>
        <ErrorViewContent {...props} />
      </BrowserRouter>
    );
  }
  return <ErrorViewContent {...props} />;
};
