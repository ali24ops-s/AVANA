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

import { EmailVerificationPage } from "../components/shell/EmailVerificationPage.js";

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
            path: "*",
            element: <Navigate to="/home" replace />,
          },
        ],
      },
    ],
  },
]);
