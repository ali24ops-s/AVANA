/**
 * Application route definitions.
 *
 * Public routes:
 *   /sign-in — Sign in page
 *   /login   — Alias to Sign in page
 *
 * Protected routes (behind AuthenticatedShell):
 *   /             — AVANA Home / Dashboard (HomePage)
 *   /home         — AVANA Home / Dashboard (HomePage)
 *   /courses      — Course list
 *   /courses/:courseId — Course detail / learning hub
 *   /courses/:courseId/manage — Course content & documents manager
 */

import { createBrowserRouter, Navigate } from "react-router-dom";
import { ProtectedRoute } from "../components/shell/ProtectedRoute.js";
import { RequireCourseManager } from "../components/shell/RequireCourseManager.js";
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import { SignInPage } from "../components/shell/SignInPage.js";
import { RegisterPage } from "../components/shell/RegisterPage.js";
import { LandingPage } from "../components/LandingPage.js";
import { AboutPage } from "../pages/AboutPage.js";
import { HomePage } from "../pages/HomePage.js";
import { CourseListPage } from "../pages/CourseListPage.js";
import { LearningPage } from "../pages/LearningPage.js";
import { CourseContentPage } from "../pages/CourseContentPage.js";
import { FlashcardsPage } from "../pages/FlashcardsPage.js";
import { ReviewPage } from "../pages/ReviewPage.js";
import { ExamsPage } from "../pages/ExamsPage.js";
import { FilesPage } from "../pages/FilesPage.js";
import { FILES_ENABLED } from "../config/features.js";
import { LibraryPage } from "../pages/LibraryPage.js";
import { CheckoutCallbackPage } from "../pages/CheckoutCallbackPage.js";
import { EmailVerificationPage } from "../components/shell/EmailVerificationPage.js";
import { PricingPage } from "../pages/PricingPage.js";
import { TermsPage } from "../pages/TermsPage.js";
import { UserSubscriptionPage } from "../pages/account/UserSubscriptionPage.js";
import { UserPurchasesPage } from "../pages/account/UserPurchasesPage.js";
import { CardToCardPaymentPage } from "../pages/CardToCardPaymentPage.js";

// Admin Imports
import { AdminLayout } from "../components/shell/AdminLayout.js";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage.js";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage.js";
import { AdminGenerationPage } from "../pages/admin/AdminGenerationPage.js";
import { AdminIntegrityPage } from "../pages/admin/AdminIntegrityPage.js";
import { AdminCoursesPage } from "../pages/admin/AdminCoursesPage.js";
import { AdminDocumentsPage } from "../pages/admin/AdminDocumentsPage.js";
import { AdminDocumentDetailPage } from "../pages/admin/AdminDocumentDetailPage.js";
import { AdminContentPage } from "../pages/admin/AdminContentPage.js";
import { AdminGenerationDetailPage } from "../pages/admin/AdminGenerationDetailPage.js";
import { AdminSystemHealthPage } from "../pages/admin/AdminSystemHealthPage.js";
import { AdminLogsPage } from "../pages/admin/AdminLogsPage.js";
import { AdminAuditLogPage } from "../pages/admin/AdminAuditLogPage.js";
import { AdminAnalyticsPage } from "../pages/admin/AdminAnalyticsPage.js";
import { AdminAiAnalyticsPage } from "../pages/admin/AdminAiAnalyticsPage.js";
import { AdminProvidersPage } from "../pages/admin/AdminProvidersPage.js";
import { AdminPromptsPage } from "../pages/admin/AdminPromptsPage.js";
import { AdminSettingsPage } from "../pages/admin/AdminSettingsPage.js";
import { AdminCommerceDashboardPage } from "../pages/admin/commerce/AdminCommerceDashboardPage.js";
import { AdminOrdersPage } from "../pages/admin/commerce/AdminOrdersPage.js";
import { AdminPaymentsPage } from "../pages/admin/commerce/AdminPaymentsPage.js";
import { AdminSubscriptionsPage } from "../pages/admin/commerce/AdminSubscriptionsPage.js";
import { AdminEntitlementsPage } from "../pages/admin/commerce/AdminEntitlementsPage.js";
import { AdminProductsPage } from "../pages/admin/commerce/AdminProductsPage.js";
import { AdminContentStudioPage } from "../pages/admin/AdminContentStudioPage.js";
import { AdminCourseHubPage } from "../pages/admin/AdminCourseHubPage.js";
import { AdminCommunityContentPage } from "../pages/admin/AdminCommunityContentPage.js";

// Blog Imports
import { BlogListPage } from "../pages/blog/BlogListPage.js";
import { BlogDetailPage } from "../pages/blog/BlogDetailPage.js";
import { BlogCategoryPage } from "../pages/blog/BlogCategoryPage.js";
import { AdminBlogListPage } from "../pages/admin/blog/AdminBlogListPage.js";
import { AdminBlogEditPage } from "../pages/admin/blog/AdminBlogEditPage.js";
import { AdminBlogPreviewPage } from "../pages/admin/blog/AdminBlogPreviewPage.js";

const getRouterBasename = () => {
  if (typeof window !== "undefined") {
    // If running under /AVANA subpath (e.g. GitHub Pages https://<user>.github.io/AVANA/)
    if (window.location.pathname.startsWith("/AVANA")) {
      return "/AVANA";
    }
    // Otherwise on localhost, preview server, or custom domain, use root "/"
    return "/";
  }
  const raw = import.meta.env.BASE_URL || "/";
  return raw === "./" || raw === "." ? "/" : (raw.length > 1 ? raw.replace(/\/+$/, "") : raw);
};

export const router = createBrowserRouter(
  [
    // Public routes
    {
      path: "/",
      element: <LandingPage />,
    },
    {
      path: "/about",
      element: <AboutPage />,
    },
    {
      path: "/about-us",
      element: <Navigate to="/about" replace />,
    },
    {
      path: "/sign-in",
      element: <SignInPage />,
    },
    {
      path: "/login",
      element: <SignInPage />,
    },
    {
      path: "/register",
      element: <RegisterPage />,
    },
    {
      path: "/sign-up",
      element: <RegisterPage />,
    },
    {
      path: "/terms",
      element: <TermsPage />,
    },
    {
      path: "/terms-of-service",
      element: <Navigate to="/terms" replace />,
    },
    {
      path: "/blog",
      element: <BlogListPage />,
    },
    {
      path: "/blog/:slug",
      element: <BlogDetailPage />,
    },
    {
      path: "/blog/category/:slug",
      element: <BlogCategoryPage />,
    },

    // Protected routes (require authentication)
    {
      path: "/",
      element: <ProtectedRoute />,
      children: [
        {
          path: "verify-email",
          element: <EmailVerificationPage />,
        },
        {
          path: "exams/attempt/:attemptId",
          element: <ExamsPage />,
        },
        {
          element: <AuthenticatedShell />,
          children: [
            {
              path: "home",
              element: <HomePage />,
            },
            {
              path: "courses",
              element: <CourseListPage />,
            },
            {
              path: "courses/:courseId",
              element: <LearningPage />,
            },
            {
              path: "courses/:courseId/manage",
              element: <RequireCourseManager />,
              children: [
                {
                  index: true,
                  element: <CourseContentPage />,
                },
              ],
            },
            {
              path: "flashcards",
              element: <FlashcardsPage />,
            },
            {
              path: "flashcards/review",
              element: <ReviewPage />,
            },
            {
              path: "exams",
              element: <ExamsPage />,
            },
            {
              path: "files",
              element: FILES_ENABLED ? (
                <FilesPage />
              ) : (
                <Navigate to="/library" replace />
              ),
            },
            {
              path: "library",
              element: <LibraryPage />,
            },
            {
              path: "pricing",
              element: <PricingPage />,
            },
            {
              path: "account/subscription",
              element: <UserSubscriptionPage />,
            },
            {
              path: "settings/subscription",
              element: <Navigate to="/account/subscription" replace />,
            },
            {
              path: "account/purchases",
              element: <UserPurchasesPage />,
            },
            {
              path: "settings/purchases",
              element: <Navigate to="/account/purchases" replace />,
            },
            {
              path: "checkout/callback",
              element: <CheckoutCallbackPage />,
            },
            {
              path: "checkout/card-to-card",
              element: <CardToCardPaymentPage />,
            },
            {
              path: "payment/card-to-card",
              element: <CardToCardPaymentPage />,
            },
            {
              path: "*",
              element: <Navigate to="/home" replace />,
            },
          ],
        },
        // Admin Panel Routes
        {
          path: "admin",
          element: <AdminLayout />,
          children: [
            {
              index: true,
              element: <Navigate to="/admin/dashboard" replace />,
            },
            {
              path: "dashboard",
              element: <AdminDashboardPage />,
            },
            {
              path: "commerce",
              element: <AdminCommerceDashboardPage />,
            },
            {
              path: "commerce/orders",
              element: <AdminOrdersPage />,
            },
            {
              path: "commerce/payments",
              element: <AdminPaymentsPage />,
            },
            {
              path: "commerce/subscriptions",
              element: <AdminSubscriptionsPage />,
            },
            {
              path: "commerce/entitlements",
              element: <AdminEntitlementsPage />,
            },
            {
              path: "commerce/products",
              element: <AdminProductsPage />,
            },
            {
              path: "analytics",
              element: <AdminAnalyticsPage />,
            },
            {
              path: "analytics/ai",
              element: <AdminAiAnalyticsPage />,
            },
            {
              path: "content-studio",
              element: <AdminContentStudioPage />,
            },
            {
              path: "content-studio/:courseId",
              element: <AdminContentStudioPage />,
            },
            {
              path: "courses",
              element: <AdminCoursesPage />,
            },
            {
              path: "courses/:courseId",
              element: <AdminCourseHubPage />,
            },
            {
              path: "documents",
              element: <AdminDocumentsPage />,
            },
            {
              path: "documents/:id",
              element: <AdminDocumentDetailPage />,
            },
            {
              path: "content",
              element: <AdminContentPage />,
            },
            {
              path: "blog",
              element: <AdminBlogListPage />,
            },
            {
              path: "blog/new",
              element: <AdminBlogEditPage />,
            },
            {
              path: "blog/:id/edit",
              element: <AdminBlogEditPage />,
            },
            {
              path: "blog/:id/preview",
              element: <AdminBlogPreviewPage />,
            },
            {
              path: "community-content",
              element: <AdminCommunityContentPage />,
            },
            {
              path: "community-content/:id",
              element: <AdminCommunityContentPage />,
            },
            {
              path: "users",
              element: <AdminUsersPage />,
            },
            {
              path: "generation",
              element: <AdminGenerationPage />,
            },
            {
              path: "generation/providers",
              element: <AdminProvidersPage />,
            },
            {
              path: "generation/prompts",
              element: <AdminPromptsPage />,
            },
            {
              path: "generation/:id",
              element: <AdminGenerationDetailPage />,
            },
            {
              path: "system/health",
              element: <AdminSystemHealthPage />,
            },
            {
              path: "system/integrity",
              element: <AdminIntegrityPage />,
            },
            {
              path: "system/logs",
              element: <AdminLogsPage />,
            },
            {
              path: "system/audit",
              element: <AdminAuditLogPage />,
            },
            {
              path: "settings",
              element: <AdminSettingsPage />,
            },
          ],
        },
      ],
    },
  ],
  {
    basename: getRouterBasename(),
  },
);

