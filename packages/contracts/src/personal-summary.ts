/**
 * Personal Summary Contracts & DTOs (Highlights & Notes AI Synthesis).
 */

export type PersonalContentType = "review_summary" | "flashcard" | "quiz" | "mind_map";
export type PersonalContentStatus = "pending" | "completed" | "failed" | "ready" | "idle";
export type PersonalRefundStatus = "none" | "pending" | "refunded" | "failed";

export interface PersonalAnnotationSnapshotItem {
  id: string;
  lessonId: string;
  lessonTitle: string;
  lessonSortOrder: number;
  type: "highlight" | "note";
  selectedText: string;
  prefix: string | null;
  suffix: string | null;
  startOffset: number | null;
  endOffset: number | null;
  color: string;
  noteText: string | null;
  createdAt: string;
}

export interface PersonalContentSnapshot {
  capturedAt: string;
  moduleId: string;
  moduleTitle: string;
  courseId: string;
  totalHighlights: number;
  totalNotes: number;
  items: PersonalAnnotationSnapshotItem[];
}

export interface PersonalSummaryDto {
  id: string;
  userId: string;
  courseId: string;
  moduleId: string;
  contentType: PersonalContentType;
  version: number;
  status: PersonalContentStatus;
  payload: Record<string, unknown>;
  highlightsCount: number;
  notesCount: number;
  costToman: number;
  transactionId?: string | null;
  refundTransactionId?: string | null;
  refundStatus?: PersonalRefundStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentAnnotationsStats {
  highlights_count: number;
  notes_count: number;
  total_count: number;
  has_new_annotations: boolean;
}

export interface GetPersonalSummaryResponse {
  has_personal_summary: boolean;
  summary: PersonalSummaryDto | null;
  current_annotations: CurrentAnnotationsStats;
  cost_toman: number;
}

export interface GeneratePersonalSummaryResponse {
  success: boolean;
  summary: PersonalSummaryDto;
  transaction_id: string;
}
