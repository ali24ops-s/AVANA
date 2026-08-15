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
import { HomePage } from "../pages/HomePage.js";
import { CourseListPage } from "../pages/CourseListPage.js";
import { LearningPage } from "../pages/LearningPage.js";
import { CourseContentPage } from "../pages/CourseContentPage.js";

export const router = createBrowserRouter([
  // Public routes
  {
    path: "/sign-in",
    element: <SignInPage />,
  },
  {
    path: "/login",
    element: <SignInPage />,
  },

  // Protected routes (require authentication)
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      {
        element: <AuthenticatedShell />,
        children: [
          {
            index: true,
            element: <HomePage />,
          },
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
            path: "*",
            element: <Navigate to="/home" replace />,
          },
        ],
      },
    ],
  },
]);
