/**
 * Daily Study Planner Contracts (Phase 3).
 *
 * Types and resources for student-facing daily study planning API.
 */

export type StudyTaskType =
  | "read_lesson"
  | "review_flashcards"
  | "take_quiz"
  | "review_wrong_answers";

export type StudyPlanStatus = "pending" | "in_progress" | "completed";

export type StudyTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped";

export type StudyTaskCategory = "mandatory" | "optional" | "extra_practice";

export interface ExamScope {
  moduleIds?: string[];
  lessonIds?: string[];
}

export interface StudyTaskMetadata {
  category?: StudyTaskCategory;
  isExamRelated?: boolean;
  examDaysRemaining?: number;
  examCourseName?: string;
  dueCount?: number;
  isPartiallyStudied?: boolean;
  isTargetedReview?: boolean;
  isNewLearning?: boolean;
  learningStage?: string;
  courseName?: string;
  quizTitle?: string;
  lastScore?: number;
  chapterNumbers?: number[];
  [key: string]: unknown;
}

export interface StudyTaskResource {
  id: string;
  planId: string;
  userId: string;
  taskType: StudyTaskType;
  status: StudyTaskStatus;
  category?: StudyTaskCategory;
  title: string;
  description: string | null;
  priority: number;
  estimatedMinutes: number;
  completedAt: string | null;
  courseId: string | null;
  moduleId: string | null;
  lessonId: string | null;
  quizId: string | null;
  metadata: StudyTaskMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface DailyStudyPlanResource {
  id: string;
  userId: string;
  planDate: string;
  status: StudyPlanStatus;
  targetDurationMinutes: number;
  completedDurationMinutes: number;
  remainingDurationMinutes: number;
  tasks: StudyTaskResource[];
  createdAt: string;
  updatedAt: string;
}

export interface DailyStudyPlanResponse {
  request_id?: string;
  plan: DailyStudyPlanResource;
}

export interface RegenerateDailyPlanRequest {
  targetMinutes?: number;
  timezone?: string;
}

export interface UpdateStudyTaskStatusRequest {
  status: StudyTaskStatus;
}

export interface UpdateStudyTaskStatusResponse {
  request_id?: string;
  task: StudyTaskResource;
}
