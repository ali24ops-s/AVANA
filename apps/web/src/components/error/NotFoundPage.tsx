import React from "react";
import { ErrorView } from "./ErrorView.js";

export interface NotFoundPageProps {
  className?: string;
}

/**
 * Dedicated AVANA 404 (Not Found) Page.
 *
 * Implements the brand's approved visual identity:
 * - Minimalist SaaS layout with light-first aesthetic (#F7F9FA / #FFFFFF)
 * - Authentic geometric Avani mascot with confused/quizzical pose
 * - Estedad Persian typography, RTL alignment
 * - Primary Action: "رفتن به صفحه اصلی"
 * - Secondary Action: "بازگشت به صفحه قبل" with smart navigation history detection
 * - Support Link: Points to official AVANA user support
 * - SEO meta tags: noindex, nofollow, and page title
 */
export const NotFoundPage: React.FC<NotFoundPageProps> = ({ className = "" }) => {
  return (
    <ErrorView
      type="404"
      statusCode="۴۰۴"
      title="اینجا چیزی برای پیدا کردن نیست!"
      description="صفحه‌ای که دنبالش هستی پیدا نشد. شاید آدرس اشتباه باشه یا این صفحه جابه‌جا شده باشه."
      avaniPose="confused"
      className={className}
    />
  );
};

export default NotFoundPage;
