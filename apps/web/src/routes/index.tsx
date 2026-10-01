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
 *   /courses/:courseId/manage — Compatibility redirect to Course Hub or Course detail
 */

import { createBrowserRouter, Navigate, useParams } from "react-router-dom";
import { ProtectedRoute } from "../components/shell/ProtectedRoute.js";
import { useAuth } from "../providers/AuthProvider.js";
import { isContentManagerOrAdmin } from "../utils/generationPermissions.js";
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import { SignInPage } from "../components/shell/SignInPage.js";
import { RegisterPage } from "../components/shell/RegisterPage.js";
import { ForgotPasswordPage } from "../components/shell/ForgotPasswordPage.js";
import { ResetPasswordPage } from "../components/shell/ResetPasswordPage.js";
import { LandingPage } from "../components/LandingPage.js";
import { HomePage } from "../pages/HomePage.js";
import { CourseListPage } from "../pages/CourseListPage.js";
import { LearningPage } from "../pages/LearningPage.js";
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
import { UserWalletPage } from "../pages/account/UserWalletPage.js";
import { UserReferralPage } from "../pages/account/UserReferralPage.js";
import { UserSupportPage } from "../pages/account/UserSupportPage.js";
import { CardToCardPaymentPage } from "../pages/CardToCardPaymentPage.js";

// Admin Imports
import { AdminLayout } from "../components/shell/AdminLayout.js";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage.js";
import { AdminSupportPage } from "../pages/admin/support/AdminSupportPage.js";

import { AdminUsersPage } from "../pages/admin/AdminUsersPage.js";
import { AdminTeachersPage } from "../pages/admin/AdminTeachersPage.js";
import { AdminUserSubscriptionsPage } from "../pages/admin/users/AdminUserSubscriptionsPage.js";
import { AdminUserPurchasesPage } from "../pages/admin/users/AdminUserPurchasesPage.js";
import { AdminUserWalletTopupsPage } from "../pages/admin/users/AdminUserWalletTopupsPage.js";
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
import { AdminPromotionsPage } from "../pages/admin/commerce/AdminPromotionsPage.js";
import { AdminReferralsPage } from "../pages/admin/commerce/AdminReferralsPage.js";
import { AdminContentStudioPage } from "../pages/admin/AdminContentStudioPage.js";
import { AdminCourseHubPage } from "../pages/admin/AdminCourseHubPage.js";
import { AdminCommunityContentPage } from "../pages/admin/AdminCommunityContentPage.js";

// Blog Imports
import { BlogListPage } from "../pages/blog/BlogListPage.js";
import { BlogDetailPage } from "../pages/blog/BlogDetailPage.js";
import { BlogCategoryPage } from "../pages/blog/BlogCategoryPage.js";
import { BlogTagPage } from "../pages/blog/BlogTagPage.js";
import { AdminBlogListPage } from "../pages/admin/blog/AdminBlogListPage.js";
import { AdminBlogEditPage } from "../pages/admin/blog/AdminBlogEditPage.js";
import { AdminBlogPreviewPage } from "../pages/admin/blog/AdminBlogPreviewPage.js";

// Teacher Platform Imports
import { TeacherRouteGuard } from "../components/teacher/TeacherRouteGuard.js";
import { TeacherShell } from "../components/teacher/TeacherShell.js";
import { TeacherIntroPage } from "../pages/TeacherIntroPage.js";
import { TeacherDashboardPage } from "../pages/teacher/TeacherDashboardPage.js";
import { TeacherClassroomsPage } from "../pages/teacher/TeacherClassroomsPage.js";
import { TeacherClassroomDetailPage } from "../pages/teacher/TeacherClassroomDetailPage.js";
import { TeacherExamCreatePage } from "../pages/teacher/TeacherExamCreatePage.js";
import { TeacherExamDetailPage } from "../pages/teacher/TeacherExamDetailPage.js";
import { TeacherExamEditorPage } from "../pages/teacher/TeacherExamEditorPage.js";
import { TeacherExamResultsPage } from "../pages/teacher/TeacherExamResultsPage.js";
import { TeacherStudentResultDetailPage } from "../pages/teacher/TeacherStudentResultDetailPage.js";

// Student Platform Imports
import { StudentClassroomsPage } from "../pages/student/StudentClassroomsPage.js";
import { StudentClassroomDetailPage } from "../pages/student/StudentClassroomDetailPage.js";
import { StudentExamDetailPage } from "../pages/student/StudentExamDetailPage.js";
import { StudentExamTakingPage } from "../pages/student/StudentExamTakingPage.js";
import { StudentExamResultsPage } from "../pages/student/StudentExamResultsPage.js";

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

function CourseManageRedirect() {
  const { courseId } = useParams<{ courseId: string }>();
  const { user, memberships } = useAuth();
  const isAdmin = isContentManagerOrAdmin(user, memberships);

  if (isAdmin) {
    return <Navigate to={`/admin/courses/${courseId ?? ""}`} replace />;
  }
  return <Navigate to={`/courses/${courseId ?? ""}`} replace />;
}

export const router = createBrowserRouter(
  [
    // Public routes
    {
      path: "/",
      element: <LandingPage />,
    },
    {
      path: "/about",
      element: <Navigate to="/" replace />,
    },
    {
      path: "/about-us",
      element: <Navigate to="/" replace />,
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
      path: "/forgot-password",
      element: <ForgotPasswordPage />,
    },
    {
      path: "/reset-password",
      element: <ResetPasswordPage />,
    },
    {
      path: "/teachers",
      element: <TeacherIntroPage />,
    },
    {
      path: "/for-teachers",
      element: <Navigate to="/teachers" replace />,
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
    {
      path: "/blog/tag/:slug",
      element: <BlogTagPage />,
    },

    // Anatomy Lesson POC Route (Directly viewable in AVANA AuthenticatedShell without authentication barriers)
    {
      element: <AuthenticatedShell />,
      children: [
        {
          path: "/courses/anatomy-heart",
          element: <LearningPage initialCourseId="anatomy-heart" />,
        },
        {
          path: "/anatomy-poc",
          element: <Navigate to="/courses/anatomy-heart" replace />,
        },
      ],
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
          path: "classrooms/:classroomId/exams/:examId/take",
          element: <StudentExamTakingPage />,
        },
        {
          element: <AuthenticatedShell />,
          children: [
            {
              path: "home",
              element: <HomePage />,
            },
            {
              path: "classrooms",
              element: <StudentClassroomsPage />,
            },
            {
              path: "classrooms/:classroomId",
              element: <StudentClassroomDetailPage />,
            },
            {
              path: "classrooms/:classroomId/exams/:examId",
              element: <StudentExamDetailPage />,
            },
            {
              path: "classrooms/:classroomId/exams/:examId/results",
              element: <StudentExamResultsPage />,
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
              element: <CourseManageRedirect />,
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
              path: "account/wallet",
              element: <UserWalletPage />,
            },
            {
              path: "account/referral",
              element: <UserReferralPage />,
            },
            {
              path: "settings/referral",
              element: <Navigate to="/account/referral" replace />,
            },
            {
              path: "account/support",
              element: <UserSupportPage />,
            },
            {
              path: "settings/support",
              element: <Navigate to="/account/support" replace />,
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
        // Teacher Platform Routes
        {
          path: "teacher",
          element: (
            <TeacherRouteGuard>
              <TeacherShell />
            </TeacherRouteGuard>
          ),
          children: [
            {
              index: true,
              element: <TeacherDashboardPage />,
            },
            {
              path: "dashboard",
              element: <Navigate to="/teacher" replace />,
            },
            {
              path: "classrooms",
              element: <TeacherClassroomsPage />,
            },
            {
              path: "classrooms/:classroomId",
              element: <TeacherClassroomDetailPage />,
            },
            {
              path: "classrooms/:classroomId/exams/new",
              element: <TeacherExamCreatePage />,
            },
            {
              path: "exams/:examId",
              element: <TeacherExamDetailPage />,
            },
            {
              path: "exams/:examId/edit",
              element: <TeacherExamEditorPage />,
            },
            {
              path: "exams/:examId/results",
              element: <TeacherExamResultsPage />,
            },
            {
              path: "exams/:examId/results/:studentId",
              element: <TeacherStudentResultDetailPage />,
            },
            {
              path: "*",
              element: <Navigate to="/teacher" replace />,
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
              path: "commerce/referrals",
              element: <AdminReferralsPage />,
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
              path: "commerce/promotions",
              element: <AdminPromotionsPage />,
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
              path: "support",
              element: <AdminSupportPage />,
            },
            {
              path: "support/:id",
              element: <AdminSupportPage />,
            },
            {
              path: "users",
              element: <AdminUsersPage />,
            },
            {
              path: "teachers",
              element: <AdminTeachersPage />,
            },
            {
              path: "users/subscriptions",
              element: <AdminUserSubscriptionsPage />,
            },
            {
              path: "users/purchases",
              element: <AdminUserPurchasesPage />,
            },
            {
              path: "users/wallet-topups",
              element: <AdminUserWalletTopupsPage />,
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

