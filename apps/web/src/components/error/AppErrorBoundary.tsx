import React from "react";
import { useRouteError, isRouteErrorResponse } from "react-router-dom";
import { ErrorView } from "./ErrorView.js";
import { NotFoundPage } from "./NotFoundPage.js";

/**
 * Route-level Error Element for React Router.
 * Catches route loading, action, rendering, and 404 response errors.
 */
export function RouteErrorElement() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return <NotFoundPage />;
    }
    if (error.status === 403) {
      return (
        <ErrorView
          type="forbidden"
          statusCode="۴۰۳"
          title="دسترسی به این صفحه مجاز نیست"
          description="حساب کاربری شما دسترسی کافی برای مشاهده یا ویرایش این بخش را ندارد."
        />
      );
    }
    return (
      <ErrorView
        type="500"
        statusCode={error.status}
        title="خطا در بارگذاری صفحه"
        description="متأسفانه در پاسخ‌دهی به این صفحه خطایی رخ داد. لطفاً دوباره تلاش کنید."
      />
    );
  }

  // Network / Offline check
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return <ErrorView type="offline" />;
  }

  const errorMessage =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";

  if (
    errorMessage.includes("Failed to fetch") ||
    errorMessage.includes("NetworkError") ||
    errorMessage.includes("net::ERR_")
  ) {
    return <ErrorView type="offline" />;
  }

  // General uncaught unexpected runtime error
  return (
    <ErrorView
      type="500"
      statusCode="۵۰۰"
      title="خطای غیرمنتظره در سامانه"
      description="متأسفانه مشکلی در اجرای این بخش رخ داد. تیم فنی آوانا در حال بررسی است."
    />
  );
}

export interface AppErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  compact?: boolean;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary component for catching runtime rendering errors
 * in application subtrees without crashing the entire page.
 */
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("AVANA Error Boundary caught unexpected runtime error:", error, errorInfo);
    }
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorView
          type="500"
          compact={this.props.compact}
          statusCode="۵۰۰"
          title="خطای غیرمنتظره در سامانه"
          description="متأسفانه مشکلی در بارگذاری این بخش رخ داد. می‌توانید دوباره تلاش کنید."
          primaryAction={{
            label: "تلاش مجدد",
            onClick: this.resetError,
          }}
        />
      );
    }

    return this.props.children;
  }
}
