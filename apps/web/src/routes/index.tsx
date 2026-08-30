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
import { HomePage } from "../pages/HomePage.js";
import { CourseListPage } from "../pages/CourseListPage.js";
import { LearningPage } from "../pages/LearningPage.js";
import { CourseContentPage } from "../pages/CourseContentPage.js";
import { FlashcardsPage } from "../pages/FlashcardsPage.js";
import { ReviewPage } from "../pages/ReviewPage.js";
import { ExamsPage } from "../pages/ExamsPage.js";
import { FilesPage } from "../pages/FilesPage.js";
import { LibraryPage } from "../pages/LibraryPage.js";
import { EmailVerificationPage } from "../components/shell/EmailVerificationPage.js";

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

export const router = createBrowserRouter([
  // Public routes
  {
    path: "/",
    element: <LandingPage />,
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
            path: "exams/attempt/:attemptId",
            element: <ExamsPage />,
          },
          {
            path: "files",
            element: <FilesPage />,
          },
          {
            path: "library",
            element: <LibraryPage />,
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
            path: "analytics",
            element: <AdminAnalyticsPage />,
          },
          {
            path: "analytics/ai",
            element: <AdminAiAnalyticsPage />,
          },
          {
            path: "courses",
            element: <AdminCoursesPage />,
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
]);

