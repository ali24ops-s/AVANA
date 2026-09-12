/**
 * Study module public API (PR6-7).
 */
export { StudyService } from "./study-service.js";
export type {
  FlashcardRecord,
  FlashcardReviewRecord,
  FlashcardScheduleUpdate,
  UserFlashcardScheduleRecord,
  QuizRecord,
  QuizQuestionRecord,
  FlashcardStore,
  FlashcardReviewStore,
  UserFlashcardScheduleStore,
  QuizStore,
  QuizQuestionStore,
  QuizAttemptStore,
  StudySessionStore,
  FlashcardStudySessionStore,
} from "./study-store.js";
export {
  DrizzleFlashcardStore,
  DrizzleFlashcardReviewStore,
  DrizzleUserFlashcardScheduleStore,
  DrizzleQuizStore,
  DrizzleQuizQuestionStore,
  DrizzleQuizAttemptStore,
  DrizzleStudySessionStore,
  DrizzleFlashcardStudySessionStore,
} from "./drizzle-stores.js";
export { studyRoutes } from "./study-routes.js";
export { StudyAssistantService } from "./assistant-service.js";
export type {
  AssistantConversation,
  AssistantMessage,
  AssistantConversationStore,
} from "./assistant-store.js";
export {
  InMemoryAssistantConversationStore,
  DrizzleAssistantConversationStore,
} from "./assistant-store.js";
export { assistantRoutes } from "./assistant-routes.js";
export {
  SpecialExamAutomationService,
  COURSE_SPECIAL_EXAM_QUESTION_COUNT,
  CHAPTER_SPECIAL_EXAM_QUESTION_COUNT,
  getCourseSpecialExamCode,
  getChapterSpecialExamCode,
  type SpecialExamAutomationOptions,
} from "./special-exam-automation-service.js";
export { AnnotationService } from "./annotation-service.js";
export type {
  LessonAnnotationRecord,
  ContentReportRecord,
  LessonAnnotationStore,
  ContentReportStore,
} from "./annotation-store.js";
export {
  InMemoryLessonAnnotationStore,
  InMemoryContentReportStore,
  DrizzleLessonAnnotationStore,
  DrizzleContentReportStore,
} from "./annotation-store.js";
