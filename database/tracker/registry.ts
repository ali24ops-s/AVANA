import type { MigrationDefinition } from "./types.js";

import { up as up0001 } from "../migrations/0001_init.js";
import { up as up0002 } from "../migrations/0002_auth.js";
import { up as up0003 } from "../migrations/0003_learning_core.js";
import { up as up0004 } from "../migrations/0004_lesson_publication.js";
import { up as up0005 } from "../migrations/0005_ai_learning_engine.js";
import { up as up0006 } from "../migrations/0006_generation_idempotency.js";
import { up as up0007 } from "../migrations/0007_generation_jobs.js";
import { up as up0008 } from "../migrations/0008_content_review.js";
import { up as up0009 } from "../migrations/0009_study_consumption.js";
import { up as up0010 } from "../migrations/0010_user_flashcard_schedules.js";
import { up as up0011 } from "../migrations/0011_exams_configuration.js";
import { up as up0012 } from "../migrations/0012_taxonomy_lesson_relations.js";
import { up as up0013 } from "../migrations/0013_document_module_invariant.js";
import { up as up0014 } from "../migrations/0014_email_verification.js";
import { up as up0015 } from "../migrations/0015_study_conversations.js";
import { up as up0016 } from "../migrations/0016_study_sessions.js";
import { up as up0017 } from "../migrations/0017_flashcard_study_sessions.js";
import { up as up0018 } from "../migrations/0018_flashcard_session_reaction_ms.js";
import { up as up0019 } from "../migrations/0019_user_global_role.js";
import { up as up0020 } from "../migrations/0020_document_quality.js";
import { up as up0021 } from "../migrations/0021_content_packs.js";
import { up as up0022 } from "../migrations/0022_decouple_document_content.js";
import { up as up0023 } from "../migrations/0023_monetization_and_entitlements.js";
import { up as up0024 } from "../migrations/0024_official_courses_and_products.js";
import { up as up0025 } from "../migrations/0025_content_pack_review_workflow.js";
import { up as up0026 } from "../migrations/0026_migrate_legacy_content_packs_to_pending_review.js";
import { up as up0027 } from "../migrations/0027_blog_system.js";
import { up as up0028 } from "../migrations/0028_card_to_card_payments.js";
import { up as up0029 } from "../migrations/0029_device_and_single_session_security.js";
import { up as up0030 } from "../migrations/0030_content_export_import.js";
import { up as up0031 } from "../migrations/0031_widen_generation_keys.js";
import { up as up0032 } from "../migrations/0032_resumable_generation_chunks.js";
import { up as up0033 } from "../migrations/0033_widen_quiz_attempts_topic.js";
import { up as up0034 } from "../migrations/0034_generation_lease_infrastructure.js";
import { up as up0035 } from "../migrations/0035_content_pricing_and_entitlements.js";
import { up as up0036 } from "../migrations/0036_backfill_content_products.js";
import { up as up0037 } from "../migrations/0037_backfill_canonical_content_pricing.js";
import { up as up0038 } from "../migrations/0038_document_generation_progress.js";
import { up as up0039 } from "../migrations/0039_phone_verification.js";
import { up as up0040 } from "../migrations/0040_quiz_attempts_snapshot_and_metrics.js";
import { up as up0041 } from "../migrations/0041_module_preview_lesson_id.js";
import { up as up0042 } from "../migrations/0042_special_exam_entitlements.js";
import { up as up0043 } from "../migrations/0043_notifications.js";
import { up as up0044 } from "../migrations/0044_lesson_annotations_and_reports.js";
import { up as up0045 } from "../migrations/0045_sub_course_groups_and_module_ordering.js";
import { up as up0046 } from "../migrations/0046_system_configurations.js";
import { up as up0047 } from "../migrations/0047_wallet_system.js";
import { up as up0048 } from "../migrations/0048_subscription_credit_bonuses_config.js";
import { up as up0049 } from "../migrations/0049_wallet_topup_product.js";
import { up as up0050 } from "../migrations/0050_course_publications.js";
import { up as up0051 } from "../migrations/0051_promotions_and_coupons.js";
import { up as up0052 } from "../migrations/0052_referral_system.js";
import { up as up0053 } from "../migrations/0053_daily_study_planner.js";
import { up as up0054 } from "../migrations/0054_course_exam_scope.js";
import { up as up0055 } from "../migrations/0055_support_and_feedback.js";
import { up as up0056 } from "../migrations/0056_course_drafts_and_releases.js";
import { up as up0057 } from "../migrations/0057_teacher_platform_core.js";
import { up as up0058 } from "../migrations/0058_password_reset_tokens.js";
import { up as up0059 } from "../migrations/0059_allow_back_navigation.js";
import { up as up0060 } from "../migrations/0060_per_question_time_seconds.js";
import { up as up0061 } from "../migrations/0061_descriptive_exam_questions.js";
import { up as up0062 } from "../migrations/0062_optional_exam_duration_and_passing_score.js";
import { up as up0063 } from "../migrations/0063_classroom_assignments.js";
import { up as up0064 } from "../migrations/0064_teacher_approval_status.js";
import { up as up0065 } from "../migrations/0065_user_major_and_course_academic_fields.js";
import { up as up0066 } from "../migrations/0066_descriptive_answer_integrity.js";
import { up as up0067 } from "../migrations/0067_assignment_submission_attachments.js";
import { up as up0068 } from "../migrations/0068_teacher_academic_profile.js";
import { up as up0069 } from "../migrations/0069_classroom_educational_contents.js";
import { up as up0070 } from "../migrations/0070_teacher_student_messaging.js";
import { up as up0071 } from "../migrations/0071_repair_legacy_registration_org_admins.js";
import { up as up0072 } from "../migrations/0072_teacher_exam_attempt_integrity.js";
import { up as up0075 } from "../migrations/0075_question_patterns.js";
import { up as up0077 } from "../migrations/0077_question_pattern_skills_and_cognitive_levels.js";
import { up as up0078 } from "../migrations/0078_telegram_outbox.js";
import { up as up0079 } from "../migrations/0079_telegram_outbox_lease_index.js";
import { up as up0080 } from "../migrations/0080_source_packs_and_generation_sources.js";
import { up as up0081 } from "../migrations/0081_question_pattern_categories_and_defaults.js";
import { up as up0082 } from "../migrations/0082_user_welcome_gifts.js";
import { up as up0083 } from "../migrations/0083_nullable_promotion_redemption_order.js";
import { up as up0084 } from "../migrations/0084_support_message_read_receipt.js";
import { up as up0085 } from "../migrations/0085_platform_admin_multi_session.js";
import { up as up0086 } from "../migrations/0086_user_onboarding.js";
import { up as up0087 } from "../migrations/0087_lesson_reference.js";
import { up as up0088 } from "../migrations/0088_crm_core.js";
import { up as up0089 } from "../migrations/0089_crm_segments.js";
import { up as up0090 } from "../migrations/0090_course_membership_exam_schedules.js";
import { up as up0091 } from "../migrations/0091_backfill_personal_course_exam_schedules.js";
import { up as up0092 } from "../migrations/0092_update_question_pattern_instructions_and_examples.js";
import { up as up0093 } from "../migrations/0093_update_patterns_3_6_8_11_v3.js";
import { up as up0094 } from "../migrations/0094_course_publications_unique_version.js";
import { up as up0095 } from "../migrations/0095_presentation_assistant_core.js";
import { up as up0096 } from "../migrations/0096_user_personal_contents.js";
import { up as up0097 } from "../migrations/0097_mind_map_personal_content_type.js";
import { up as up0098 } from "../migrations/0098_error_monitoring_core.js";
import { up as up0099 } from "../migrations/0099_crm_campaigns.js";
import { up as up0100 } from "../migrations/0100_crm_campaign_dispatch.js";

export const ALL_MIGRATIONS: MigrationDefinition[] = [
  {
    id: "0001_init",
    sequence: 1,
    up: up0001,
    sourceFile: "0001_init.ts",
  },
  {
    id: "0002_auth",
    sequence: 2,
    up: up0002,
    sourceFile: "0002_auth.ts",
  },
  {
    id: "0003_learning_core",
    sequence: 3,
    up: up0003,
    sourceFile: "0003_learning_core.ts",
  },
  {
    id: "0004_lesson_publication",
    sequence: 4,
    up: up0004,
    sourceFile: "0004_lesson_publication.ts",
  },
  {
    id: "0005_ai_learning_engine",
    sequence: 5,
    up: up0005,
    sourceFile: "0005_ai_learning_engine.ts",
  },
  {
    id: "0006_generation_idempotency",
    sequence: 6,
    up: up0006,
    sourceFile: "0006_generation_idempotency.ts",
  },
  {
    id: "0007_generation_jobs",
    sequence: 7,
    up: up0007,
    sourceFile: "0007_generation_jobs.ts",
  },
  {
    id: "0008_content_review",
    sequence: 8,
    up: up0008,
    sourceFile: "0008_content_review.ts",
  },
  {
    id: "0009_study_consumption",
    sequence: 9,
    up: up0009,
    sourceFile: "0009_study_consumption.ts",
  },
  {
    id: "0010_user_flashcard_schedules",
    sequence: 10,
    up: up0010,
    sourceFile: "0010_user_flashcard_schedules.ts",
  },
  {
    id: "0011_exams_configuration",
    sequence: 11,
    up: up0011,
    sourceFile: "0011_exams_configuration.ts",
  },
  {
    id: "0012_taxonomy_lesson_relations",
    sequence: 12,
    up: up0012,
    sourceFile: "0012_taxonomy_lesson_relations.ts",
  },
  {
    id: "0013_document_module_invariant",
    sequence: 13,
    up: up0013,
    sourceFile: "0013_document_module_invariant.ts",
  },
  {
    id: "0014_email_verification",
    sequence: 14,
    up: up0014,
    sourceFile: "0014_email_verification.ts",
  },
  {
    id: "0015_study_conversations",
    sequence: 15,
    up: up0015,
    sourceFile: "0015_study_conversations.ts",
  },
  {
    id: "0016_study_sessions",
    sequence: 16,
    up: up0016,
    sourceFile: "0016_study_sessions.ts",
  },
  {
    id: "0017_flashcard_study_sessions",
    sequence: 17,
    up: up0017,
    sourceFile: "0017_flashcard_study_sessions.ts",
  },
  {
    id: "0018_flashcard_session_reaction_ms",
    sequence: 18,
    up: up0018,
    sourceFile: "0018_flashcard_session_reaction_ms.ts",
  },
  {
    id: "0019_user_global_role",
    sequence: 19,
    up: up0019,
    sourceFile: "0019_user_global_role.ts",
  },
  {
    id: "0020_document_quality",
    sequence: 20,
    up: up0020,
    sourceFile: "0020_document_quality.ts",
  },
  {
    id: "0021_content_packs",
    sequence: 21,
    up: up0021,
    sourceFile: "0021_content_packs.ts",
  },
  {
    id: "0022_decouple_document_content",
    sequence: 22,
    up: up0022,
    sourceFile: "0022_decouple_document_content.ts",
  },
  {
    id: "0023_monetization_and_entitlements",
    sequence: 23,
    up: up0023,
    sourceFile: "0023_monetization_and_entitlements.ts",
  },
  {
    id: "0024_official_courses_and_products",
    sequence: 24,
    up: up0024,
    sourceFile: "0024_official_courses_and_products.ts",
  },
  {
    id: "0025_content_pack_review_workflow",
    sequence: 25,
    up: up0025,
    sourceFile: "0025_content_pack_review_workflow.ts",
  },
  {
    id: "0026_migrate_legacy_content_packs_to_pending_review",
    sequence: 26,
    up: up0026,
    sourceFile: "0026_migrate_legacy_content_packs_to_pending_review.ts",
  },
  {
    id: "0027_blog_system",
    sequence: 27,
    up: up0027,
    sourceFile: "0027_blog_system.ts",
  },
  {
    id: "0028_card_to_card_payments",
    sequence: 28,
    up: up0028,
    sourceFile: "0028_card_to_card_payments.ts",
  },
  {
    id: "0029_device_and_single_session_security",
    sequence: 29,
    up: up0029,
    sourceFile: "0029_device_and_single_session_security.ts",
  },
  {
    id: "0030_content_export_import",
    sequence: 30,
    up: up0030,
    sourceFile: "0030_content_export_import.ts",
  },
  {
    id: "0031_widen_generation_keys",
    sequence: 31,
    up: up0031,
    sourceFile: "0031_widen_generation_keys.ts",
  },
  {
    id: "0032_resumable_generation_chunks",
    sequence: 32,
    up: up0032,
    sourceFile: "0032_resumable_generation_chunks.ts",
  },
  {
    id: "0033_widen_quiz_attempts_topic",
    sequence: 33,
    up: up0033,
    sourceFile: "0033_widen_quiz_attempts_topic.ts",
  },
  {
    id: "0034_generation_lease_infrastructure",
    sequence: 34,
    up: up0034,
    sourceFile: "0034_generation_lease_infrastructure.ts",
  },
  {
    id: "0035_content_pricing_and_entitlements",
    sequence: 35,
    up: up0035,
    sourceFile: "0035_content_pricing_and_entitlements.ts",
  },
  {
    id: "0036_backfill_content_products",
    sequence: 36,
    up: up0036,
    sourceFile: "0036_backfill_content_products.ts",
  },
  {
    id: "0037_backfill_canonical_content_pricing",
    sequence: 37,
    up: up0037,
    sourceFile: "0037_backfill_canonical_content_pricing.ts",
  },
  {
    id: "0038_document_generation_progress",
    sequence: 38,
    up: up0038,
    sourceFile: "0038_document_generation_progress.ts",
  },
  {
    id: "0039_phone_verification",
    sequence: 39,
    up: up0039,
    sourceFile: "0039_phone_verification.ts",
  },
  {
    id: "0040_quiz_attempts_snapshot_and_metrics",
    sequence: 40,
    up: up0040,
    sourceFile: "0040_quiz_attempts_snapshot_and_metrics.ts",
  },
  {
    id: "0041_module_preview_lesson_id",
    sequence: 41,
    up: up0041,
    sourceFile: "0041_module_preview_lesson_id.ts",
  },
  {
    id: "0042_special_exam_entitlements",
    sequence: 42,
    up: up0042,
    sourceFile: "0042_special_exam_entitlements.ts",
  },
  {
    id: "0043_notifications",
    sequence: 43,
    up: up0043,
    sourceFile: "0043_notifications.ts",
  },
  {
    id: "0044_lesson_annotations_and_reports",
    sequence: 44,
    up: up0044,
    sourceFile: "0044_lesson_annotations_and_reports.ts",
  },
  {
    id: "0045_sub_course_groups_and_module_ordering",
    sequence: 45,
    up: up0045,
    sourceFile: "0045_sub_course_groups_and_module_ordering.ts",
  },
  {
    id: "0046_system_configurations",
    sequence: 46,
    up: up0046,
    sourceFile: "0046_system_configurations.ts",
  },
  {
    id: "0047_wallet_system",
    sequence: 47,
    up: up0047,
    sourceFile: "0047_wallet_system.ts",
  },
  {
    id: "0048_subscription_credit_bonuses_config",
    sequence: 48,
    up: up0048,
    sourceFile: "0048_subscription_credit_bonuses_config.ts",
  },
  {
    id: "0049_wallet_topup_product",
    sequence: 49,
    up: up0049,
    sourceFile: "0049_wallet_topup_product.ts",
  },
  {
    id: "0050_course_publications",
    sequence: 50,
    up: up0050,
    sourceFile: "0050_course_publications.ts",
  },
  {
    id: "0051_promotions_and_coupons",
    sequence: 51,
    up: up0051,
    sourceFile: "0051_promotions_and_coupons.ts",
  },
  {
    id: "0052_referral_system",
    sequence: 52,
    up: up0052,
    sourceFile: "0052_referral_system.ts",
  },
  {
    id: "0053_daily_study_planner",
    sequence: 53,
    up: up0053,
    sourceFile: "0053_daily_study_planner.ts",
  },
  {
    id: "0054_course_exam_scope",
    sequence: 54,
    up: up0054,
    sourceFile: "0054_course_exam_scope.ts",
  },
  {
    id: "0055_support_and_feedback",
    sequence: 55,
    up: up0055,
    sourceFile: "0055_support_and_feedback.ts",
  },
  {
    id: "0056_course_drafts_and_releases",
    sequence: 56,
    up: up0056,
    sourceFile: "0056_course_drafts_and_releases.ts",
  },
  {
    id: "0057_teacher_platform_core",
    sequence: 57,
    up: up0057,
    sourceFile: "0057_teacher_platform_core.ts",
  },
  {
    id: "0058_password_reset_tokens",
    sequence: 58,
    up: up0058,
    sourceFile: "0058_password_reset_tokens.ts",
  },
  {
    id: "0059_allow_back_navigation",
    sequence: 59,
    up: up0059,
    sourceFile: "0059_allow_back_navigation.ts",
  },
  {
    id: "0060_per_question_time_seconds",
    sequence: 60,
    up: up0060,
    sourceFile: "0060_per_question_time_seconds.ts",
  },
  {
    id: "0061_descriptive_exam_questions",
    sequence: 61,
    up: up0061,
    sourceFile: "0061_descriptive_exam_questions.ts",
  },
  {
    id: "0062_optional_exam_duration_and_passing_score",
    sequence: 62,
    up: up0062,
    sourceFile: "0062_optional_exam_duration_and_passing_score.ts",
  },
  {
    id: "0063_classroom_assignments",
    sequence: 63,
    up: up0063,
    sourceFile: "0063_classroom_assignments.ts",
  },
  {
    id: "0064_teacher_approval_status",
    sequence: 64,
    up: up0064,
    sourceFile: "0064_teacher_approval_status.ts",
  },
  {
    id: "0065_user_major_and_course_academic_fields",
    sequence: 65,
    up: up0065,
    sourceFile: "0065_user_major_and_course_academic_fields.ts",
  },
  {
    id: "0066_descriptive_answer_integrity",
    sequence: 66,
    up: up0066,
    sourceFile: "0066_descriptive_answer_integrity.ts",
  },
  {
    id: "0067_assignment_submission_attachments",
    sequence: 67,
    up: up0067,
    sourceFile: "0067_assignment_submission_attachments.ts",
  },
  {
    id: "0068_teacher_academic_profile",
    sequence: 68,
    up: up0068,
    sourceFile: "0068_teacher_academic_profile.ts",
  },
  {
    id: "0069_classroom_educational_contents",
    sequence: 69,
    up: up0069,
    sourceFile: "0069_classroom_educational_contents.ts",
  },
  {
    id: "0070_teacher_student_messaging",
    sequence: 70,
    up: up0070,
    sourceFile: "0070_teacher_student_messaging.ts",
  },
  {
    id: "0071_repair_legacy_registration_org_admins",
    sequence: 71,
    up: up0071,
    sourceFile: "0071_repair_legacy_registration_org_admins.ts",
  },
  {
    id: "0072_teacher_exam_attempt_integrity",
    sequence: 72,
    up: up0072,
    sourceFile: "0072_teacher_exam_attempt_integrity.ts",
  },
  {
    id: "0075_question_patterns",
    sequence: 75,
    up: up0075,
    sourceFile: "0075_question_patterns.ts",
  },
  {
    id: "0077_question_pattern_skills_and_cognitive_levels",
    sequence: 77,
    up: up0077,
    sourceFile: "0077_question_pattern_skills_and_cognitive_levels.ts",
  },
  {
    id: "0078_telegram_outbox",
    sequence: 78,
    up: up0078,
    sourceFile: "0078_telegram_outbox.ts",
  },
  {
    id: "0079_telegram_outbox_lease_index",
    sequence: 79,
    up: up0079,
    sourceFile: "0079_telegram_outbox_lease_index.ts",
  },
  {
    id: "0080_source_packs_and_generation_sources",
    sequence: 80,
    up: up0080,
    sourceFile: "0080_source_packs_and_generation_sources.ts",
  },
  {
    id: "0081_question_pattern_categories_and_defaults",
    sequence: 81,
    up: up0081,
    sourceFile: "0081_question_pattern_categories_and_defaults.ts",
  },
  {
    id: "0082_user_welcome_gifts",
    sequence: 82,
    up: up0082,
    sourceFile: "0082_user_welcome_gifts.ts",
  },
  {
    id: "0083_nullable_promotion_redemption_order",
    sequence: 83,
    up: up0083,
    sourceFile: "0083_nullable_promotion_redemption_order.ts",
  },
  {
    id: "0084_support_message_read_receipt",
    sequence: 84,
    up: up0084,
    sourceFile: "0084_support_message_read_receipt.ts",
  },
  {
    id: "0085_platform_admin_multi_session",
    sequence: 85,
    up: up0085,
    sourceFile: "0085_platform_admin_multi_session.ts",
  },
  {
    id: "0086_user_onboarding",
    sequence: 86,
    up: up0086,
    sourceFile: "0086_user_onboarding.ts",
  },
  {
    id: "0087_lesson_reference",
    sequence: 87,
    up: up0087,
    sourceFile: "0087_lesson_reference.ts",
  },
  {
    id: "0088_crm_core",
    sequence: 88,
    up: up0088,
    sourceFile: "0088_crm_core.ts",
  },
  {
    id: "0089_crm_segments",
    sequence: 89,
    up: up0089,
    sourceFile: "0089_crm_segments.ts",
  },
  {
    id: "0090_course_membership_exam_schedules",
    sequence: 90,
    up: up0090,
    sourceFile: "0090_course_membership_exam_schedules.ts",
  },
  {
    id: "0091_backfill_personal_course_exam_schedules",
    sequence: 91,
    up: up0091,
    sourceFile: "0091_backfill_personal_course_exam_schedules.ts",
  },
  {
    id: "0092_update_question_pattern_instructions_and_examples",
    sequence: 92,
    up: up0092,
    sourceFile: "0092_update_question_pattern_instructions_and_examples.ts",
  },
  {
    id: "0093_update_patterns_3_6_8_11_v3",
    sequence: 93,
    up: up0093,
    sourceFile: "0093_update_patterns_3_6_8_11_v3.ts",
  },
  {
    id: "0094_course_publications_unique_version",
    sequence: 94,
    up: up0094,
    sourceFile: "0094_course_publications_unique_version.ts",
  },
  {
    id: "0095_presentation_assistant_core",
    sequence: 95,
    up: up0095,
    sourceFile: "0095_presentation_assistant_core.ts",
  },
  {
    id: "0096_user_personal_contents",
    sequence: 96,
    up: up0096,
    sourceFile: "0096_user_personal_contents.ts",
  },
  {
    id: "0097_mind_map_personal_content_type",
    sequence: 97,
    up: up0097,
    sourceFile: "0097_mind_map_personal_content_type.ts",
  },
  {
    id: "0098_error_monitoring_core",
    sequence: 98,
    up: up0098,
    sourceFile: "0098_error_monitoring_core.ts",
  },
  {
    id: "0099_crm_campaigns",
    sequence: 99,
    up: up0099,
    sourceFile: "0099_crm_campaigns.ts",
  },
  {
    id: "0100_crm_campaign_dispatch",
    sequence: 100,
    up: up0100,
    sourceFile: "0100_crm_campaign_dispatch.ts",
  },
];
