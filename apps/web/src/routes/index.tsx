/**
 * Application route definitions.
 *
 * Public routes:
 *   /sign-in — Sign in page
 *
 * Protected routes (behind AuthenticatedShell):
 *   /             — Redirects to /courses
 *   /courses      — Course list
 *   /courses/:courseId — Course detail
 */

import { createBrowserRouter } from "react-router-dom";
import { ProtectedRoute } from "../components/shell/ProtectedRoute.js";
import { RequireCourseManager } from "../components/shell/RequireCourseManager.js";
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import { SignInPage } from "../components/shell/SignInPage.js";
import { LandingRedirect } from "../pages/LandingRedirect.js";
import { CourseListPage } from "../pages/CourseListPage.js";
import { LearningPage } from "../pages/LearningPage.js";
import { CourseContentPage } from "../pages/CourseContentPage.js";

export const router = createBrowserRouter([
  // Public routes
  {
    path: "/sign-in",
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
            element: <LandingRedirect />,
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
        ],
      },
    ],
  },
]);
