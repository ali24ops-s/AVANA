/**
 * AVANA Worker — Studio Exam Batch Processor.
 *
 * Re-exports processor, queue contracts, and worker factory from @avana/api.
 */

export {
  createStudioExamWorker,
  processStudioExamBatchJob,
  type StudioExamProcessorDeps,
  type ProcessBatchResult,
  HEARTBEAT_INTERVAL_MS,
  LEASE_DURATION_SECONDS,
} from "@avana/api/modules/studio/studio-exam-processor";

export {
  STUDIO_EXAM_BATCH_QUEUE_NAME,
  STUDIO_EXAM_BATCH_JOB_NAME,
  type StudioExamBatchJobPayload,
  BullMqStudioExamQueue,
  type StudioExamQueue,
} from "@avana/api/modules/studio/studio-exam-queue";

export {
  DrizzleStudioExamStore,
  FencingTokenStaleError,
  type StudioExamStore,
  type ClaimBatchResult,
  type BatchExecutionDetails,
} from "@avana/api/modules/studio/studio-exam-store";
