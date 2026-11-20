/**
 * Presentation Slide Generation Prompt Builder.
 *
 * Implements Phase 2A-2.3c Generation Prompt Construction:
 * - Slide Context: title, initial text, educational goal, speaker notes.
 * - Approved Reference Context: snapshot chunks with authoritative metadata.
 * - Anti-Hallucination & Grounding Rules: strictly prevents ID fabrications and false citations.
 * - Bilingual Output: enforces language selection (Persian / English) while preserving medical/scientific precision.
 * - Controlled Repair Prompt Builder: generates focused repair instructions for single-attempt retry.
 */

import type {
  GeneratedPresentationSlide,
  PresentationAcademicLevel,
  PresentationElaborationDepth,
  PresentationGenerationInstructions,
  PresentationProjectRecord,
  PresentationSlideRecord,
  PresentationSpeakerContent,
  PresentationTone,
  ServerCitationValidationResult,
  SlideReferenceContextSnapshot,
  SnapshotReferenceChunk,
} from "@avana/domain";

export interface BuildSlidePromptInput {
  project: Pick<
    PresentationProjectRecord,
    "title" | "academicLevel" | "tone" | "elaborationDepth" | "targetDurationMinutes" | "totalSlides"
  >;
  slide: Pick<
    PresentationSlideRecord,
    "slideIndex" | "title" | "rawText" | "speakerNotes" | "visualSummary"
  >;
  snapshot: SlideReferenceContextSnapshot;
  instructions?: PresentationGenerationInstructions;
}

export interface PresentationSlideOutlineItem {
  slideIndex: number;
  title: string | null;
}

export interface BuildSpeakerPromptInput {
  project: Pick<
    PresentationProjectRecord,
    "title" | "academicLevel" | "tone" | "elaborationDepth" | "targetDurationMinutes" | "totalSlides"
  >;
  slide: Pick<
    PresentationSlideRecord,
    "slideIndex" | "title" | "rawText" | "speakerNotes" | "visualSummary"
  >;
  snapshot: SlideReferenceContextSnapshot;
  instructions?: PresentationGenerationInstructions;
  previousSlideSummary?: string | null;
  nextSlideTitle?: string | null;
  allSlidesOutline?: PresentationSlideOutlineItem[];
  coveredKeyConcepts?: string[];
}

export interface GeneratedPromptResult {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
}

export const SLIDE_GENERATION_PROMPT_VERSION = "2026-11-presentation-v1";
export const SLIDE_REPAIR_PROMPT_VERSION = "2026-11-presentation-repair-v1";
export const SPEAKER_GENERATION_PROMPT_VERSION = "2026-11-speaker-v1";
export const SPEAKER_REPAIR_PROMPT_VERSION = "2026-11-speaker-repair-v1";

export class PresentationPromptBuilder {
  /**
   * Builds the speech generation prompt for Gemini to produce PresentationSpeakerContent with Presentation Continuity.
   */
  static buildSpeakerPrompt(input: BuildSpeakerPromptInput): GeneratedPromptResult {
    const {
      project,
      slide,
      snapshot,
      instructions,
      previousSlideSummary,
      nextSlideTitle,
      allSlidesOutline,
      coveredKeyConcepts,
    } = input;

    const language = instructions?.language ?? "fa";
    const academicLevel: PresentationAcademicLevel =
      instructions?.academicLevel ?? project.academicLevel ?? "intermediate";
    const tone: PresentationTone =
      instructions?.tone ?? project.tone ?? "formal_scientific";
    const depth: PresentationElaborationDepth =
      instructions?.elaborationDepth ?? project.elaborationDepth ?? "balanced";

    const totalSlides = project.totalSlides || (allSlidesOutline ? allSlidesOutline.length : 1);
    const isFirstSlide = slide.slideIndex === 1;
    const isFinalSlide = totalSlides > 1 && slide.slideIndex === totalSlides;
    const isMiddleSlide = !isFirstSlide && !isFinalSlide;

    const systemPrompt = PresentationPromptBuilder.buildSpeakerSystemPrompt(language);

    const slideContextSection = PresentationPromptBuilder.formatSlideContext(slide);
    const referenceContextSection = PresentationPromptBuilder.formatReferenceContext(snapshot.chunks);
    const speakerGuidelinesSection = PresentationPromptBuilder.formatSpeakerGuidelines({
      projectTitle: project.title,
      totalSlides,
      slideIndex: slide.slideIndex,
      isFirstSlide,
      isMiddleSlide,
      isFinalSlide,
      academicLevel,
      tone,
      depth,
      targetDurationMinutes: project.targetDurationMinutes,
      customInstructions: instructions?.customInstructions,
      previousSlideSummary,
      nextSlideTitle,
      allSlidesOutline,
      coveredKeyConcepts,
      language,
    });
    const citationRulesSection = PresentationPromptBuilder.formatCitationRules(snapshot.chunks.length === 0);

    const userPrompt = [
      `=== PRESENTATION PROJECT ===`,
      `Project Title: ${project.title}`,
      `Slide ${slide.slideIndex} of ${totalSlides} [Position: ${
        isFirstSlide ? "FIRST / OPENING" : isFinalSlide ? "FINAL / CONCLUDING" : "MIDDLE / CONTINUATION"
      }]`,
      ``,
      slideContextSection,
      ``,
      referenceContextSection,
      ``,
      speakerGuidelinesSection,
      ``,
      citationRulesSection,
      ``,
      `=== OUTPUT INSTRUCTIONS ===`,
      `Generate the structured speaker content JSON adhering strictly to the PresentationSpeakerContent schema.`,
      language === "fa"
        ? [
            `قوانین نگارش سخنرانی پیوسته (Presentation Continuity):`,
            isFirstSlide
              ? `۱. اسلاید آغازین: فقط در صورت تناسب با لحن، با سلام و خوشامدگویی رسمی و موجز شروع کرده، موضوع و هدف ارائه را معرفی کنید.`
              : isMiddleSlide
              ? `۱. اسلاید میانی (اکیداً الزامی): هرگز با سلام، درود، خوشامدگویی، معرفی نام مدرس یا معرفی مجدد موضوع شروع نکنید. کلام را به عنوان ادامه طبیعی و بی‌پایان صحبت در اسلاید قبلی آغاز کنید. از عبارات انتقالی کلیشه‌ای و تکراری بپرهیزید و مستقیماً وارد بسط مفهوم یا تحلیل بالینی شوید.`
              : `۱. اسلاید پایانی (اکیداً الزامی): بدون سلام یا شروع جدید، پیام نهایی و جمع‌بندی جامع کل مباحث ارائه را بیان کرده و با تشکر محترمانه از توجه مخاطبان و دعوت به پرسش و پاسخ، سخنرانی را خاتمه دهید.`,
            `۲. ساختار پاراگرافی و لحن حرفه‌ای گفتار (speechText):`,
            `   - متن speechText حتماً باید دارای ساختار پاراگرافی منظم و تفکیک‌شده با خط خالی (\n\n) باشد (متناسب با حجم اسلاید، ترجیحاً ۲ تا ۴ پاراگراف منسجم).`,
            `   - هرگز کل گفتار را به شکل یک بلوک متنی فشرده و پیوسته بدون پاراگراف تولید نکنید.`,
            `   - پاراگراف‌بندی باید بر اساس تحول موضوعی و ساختار معنایی متن انجام شود (مانند: ورود به موضوع اسلاید، تشریح عمیق مکانیسم علمی یا شواهد، و کاربرد یا جمع‌بندی بالینی).`,
            `   - هر پاراگراف باید شامل چند جمله مرتبط و پیوسته باشد؛ از تبدیل تک‌تک جملات به خطوط یا پاراگراف‌های یک‌خطی بریده‌بریده اکیداً خودداری فرمایید.`,
            `   - لحن کلام باید لحن طبیعی، شیوا، گرم و مسلط یک استاد یا ارائه‌دهنده حرفه‌ای دانشگاهی باشد که برای بیان شفاهی و شنیدن مخاطب طراحی شده است (نه صرفاً یک متن کتابی یا مقاله‌ای خشک).`,
            `   - تمام نکات علمی، مکانیسم‌ها و توضیحات لازم باید با غنای کامل در بافت پاراگراف‌ها حفظ و بسط داده شوند.`,
            `   - ارتباط منطقی و پیوند کلامی میان جملات و پاراگراف‌ها کاملاً حفظ شده و از هرگونه حشو و تکرار غیرضروری پرهیز شود.`,
            `۳. ادغام اجباری و کامل تمام نکات کلیدی در متن گفتار (Key Points Integration):`,
            `   - تمامی نکات کلیدی که در آرایه keyPoints مشخص می‌کنید، باید به طور کامل، طبیعی و دقیق در متن اصلی speechText پوشش داده شده و به کار رفته باشند.`,
            `   - متن گفتار باید به تنهایی پوشش‌دهنده تمام نکات کلیدی اسلاید باشد؛ به طوری که ارائه‌دهنده با خواندن speechText هیچ نکته مهمی را از قلم نیندازد.`,
            `   - هر نکته باید در مناسب‌ترین پاراگراف متن با جمله‌بندی روان جاگذاری شود. از تکرار عین عبارت بولت خودداری کرده و آن را در قالب بیانی رسا توضیح دهید.`,
            `۴. ادغام عمق علمی در بافت گفتار (Scientific Depth):`,
            `   - عمق علمی و توضیحات تخصصی، مکانیسم‌ها و پاتوفیزیولوژی باید مستقیماً در بدنه اصلی speechText و در جای منطقی خود گنجانده شوند.`,
            `   - در صورتی که سطح عمق عمیق (comprehensive) باشد، تمام جزئیات عمیق علمی را در پاراگراف‌های speechText بسط دهید.`,
            `   - فیلد supplementaryExplanation برای حفظ سازگاری نگهداری می‌شود و می‌توانید آن را خالی ("") بگذارید یا نکات بسیار خلاصه قرار دهید.`,
            `۵. keyPoints شامل ۳ تا ۵ نکته کلیدی باشد که مخاطب باید حتماً به خاطر بسپارد.`,
            `۶. examPoints شامل نکات تستی و امتحانی بورد/پره‌انترنی باشد (در صورت عدم ارتباط، آرایه خالی []).`,
            `۷. clinicalExample یک سناریوی بالینی یا کاربردی ملموس ارائه دهد (در صورت مباحث صرفاً تئوری، null).`,
            `۸. transitionSentence یک جمله روان و غیرکلیشه‌ای برای انتقال به اسلاید بعدی پیشنهاد دهد.`,
            `۹. تمامی ادعاهای علمی مطرح‌شده در speechText باید در بخش claims ذکر شده و با chunkIdهای مجاز مستند شوند.`,
          ].join("\n")
        : [
            `Presentation Speech Continuity Rules:`,
            isFirstSlide
              ? `1. First slide: Deliver an appropriate concise greeting, introduce the presentation topic and goals.`
              : isMiddleSlide
              ? `1. Middle slide (STRICT): NEVER begin with greetings, welcomes, or re-introducing the speaker or topic. Seamlessly continue the spoken narrative where the previous slide ended, avoiding formulaic clichés.`
              : `1. Final slide (STRICT): Conclude and synthesize the overarching presentation takeaways without fresh greetings, closing gracefully with gratitude to the audience.`,
            `2. Spoken Paragraph Structure & Delivery Tone:`,
            `   - speechText MUST be organized into 2 to 4 clear, cohesive multi-sentence paragraphs separated by blank lines (\n\n).`,
            `   - Never output speech as a single compressed, continuous block of text.`,
            `   - Segment paragraphs logically by semantic topic transitions (e.g., introduction/context, core mechanism/evidence, and clinical relevance or takeaway).`,
            `   - Avoid choppy, disconnected one-liners; each paragraph must weave multiple fluent sentences into a natural lecture narrative.`,
            `   - Preserve all necessary scientific depth, mechanisms, and factual accuracy within the narrative.`,
            `3. Mandatory Key Points Integration:`,
            `   - All items listed in keyPoints MUST be explicitly woven and explained within the paragraphs of speechText.`,
            `   - The speech text alone must comprehensively cover all high-yield takeaways.`,
            `4. In-depth Scientific Elaboration:`,
            `   - When elaboration depth is comprehensive, embed foundational rationale and mechanisms directly into the narrative of speechText.`,
            `5. keyPoints must include 3-5 high-yield takeaways.`,
            `6. examPoints must contain high-yield exam pearls if relevant (or empty array []).`,
            `7. clinicalExample should describe a realistic clinical scenario (or null).`,
            `8. transitionSentence must bridge cleanly to the next topic.`,
            `9. All factual assertions must be mapped into claims with authorized chunkIds.`,
          ].join("\n"),
    ].join("\n");

    return {
      systemPrompt,
      userPrompt,
      promptVersion: SPEAKER_GENERATION_PROMPT_VERSION,
    };
  }

  /**
   * Builds a targeted prompt for repairing PresentationSpeakerContent citations.
   */
  static buildSpeakerRepairPrompt(params: {
    content: PresentationSpeakerContent;
    snapshot: SlideReferenceContextSnapshot;
    validation: ServerCitationValidationResult;
    missingKeyPoints?: string[];
    language?: string;
  }): GeneratedPromptResult {
    const { content, snapshot, validation, missingKeyPoints, language = "fa" } = params;

    const systemPrompt = [
      `You are the AVANA Presentation Citation Grounding Repair Specialist.`,
      `Your task is to fix citation integrity defects in a previously generated presentation speaker speech.`,
      `You must strictly follow the provided Allowlist of Chunk IDs and Anti-Hallucination rules.`,
    ].join(" ");

    const allowlistChunkIds = snapshot.chunks.map((c) => c.chunkId);

    const failureDetails = validation.evaluatedCitations
      .filter((c) => c.status !== "valid")
      .map((c, i) => `${i + 1}. [Status: ${c.status}] ChunkId: "${c.chunkId || "NONE"}": ${c.detail}`)
      .join("\n");

    const keyPointsDefects =
      missingKeyPoints && missingKeyPoints.length > 0
        ? `\n- The following key points were NOT covered in speechText and MUST be integrated naturally into its paragraphs: [${missingKeyPoints.join(", ")}]`
        : "";

    const userPrompt = [
      `=== CITATION VALIDATION DEFECTS DETECTED ===`,
      `The previous speaker speech generation was rejected due to the following defects:`,
      failureDetails || "Citation claims or citations array failed server validation.",
      keyPointsDefects,
      ``,
      `=== STRICT ALLOWLIST OF VALID CHUNK IDS FOR THIS SLIDE ===`,
      allowlistChunkIds.length > 0
        ? allowlistChunkIds.map((id) => `- ${id}`).join("\n")
        : `(No external reference chunks exist for this slide. Citations list must be completely empty: []).`,
      ``,
      `=== APPROVED REFERENCE CHUNKS ===`,
      PresentationPromptBuilder.formatReferenceContext(snapshot.chunks),
      ``,
      `=== PREVIOUS SPEAKER CONTENT TO REPAIR ===`,
      JSON.stringify(content, null, 2),
      ``,
      `=== REPAIR RULES ===`,
      `1. DO NOT invent or fabricate any new chunkId or referenceId. Only IDs in the Allowlist above are permitted.`,
      `2. For each claim in "claims" with an invalid or unverified citation:`,
      `   a) If the claim is genuinely supported by one of the Allowed Chunk IDs above, change its chunkIds to that exact ID and set evidenceStatus="supported".`,
      `   b) If the claim is NOT directly supported by the allowed chunks, or if there is insufficient evidence, change evidenceStatus="insufficient_evidence" and set chunkIds=[].`,
      `3. DO NOT delete scientific explanations or weaken the spoken text unnecessarily.`,
      `4. In the top-level "citations" array, include ONLY chunk IDs that are actually referenced by supported claims. Remove any unused or extra citations.`,
      `5. Return the corrected complete PresentationSpeakerContent JSON.`,
      language === "fa"
        ? `زبان سخنرانی و توضیحات باید به زبان فارسی علمی و روان حفظ شود.`
        : `Language must remain in professional academic English.`,
    ].join("\n");

    return {
      systemPrompt,
      userPrompt,
      promptVersion: SPEAKER_REPAIR_PROMPT_VERSION,
    };
  }
  /**
   * Builds the primary slide generation prompt for Gemini.
   */
  static buildSlidePrompt(input: BuildSlidePromptInput): GeneratedPromptResult {
    const { project, slide, snapshot, instructions } = input;

    const language = instructions?.language ?? "fa";
    const academicLevel: PresentationAcademicLevel =
      instructions?.academicLevel ?? project.academicLevel ?? "intermediate";
    const tone: PresentationTone =
      instructions?.tone ?? project.tone ?? "formal_scientific";
    const depth: PresentationElaborationDepth =
      instructions?.elaborationDepth ?? project.elaborationDepth ?? "balanced";

    const systemPrompt = PresentationPromptBuilder.buildSystemPrompt(language);

    const slideContextSection = PresentationPromptBuilder.formatSlideContext(slide);
    const referenceContextSection = PresentationPromptBuilder.formatReferenceContext(snapshot.chunks);
    const styleSection = PresentationPromptBuilder.formatStyleGuidelines({
      academicLevel,
      tone,
      depth,
      targetDurationMinutes: project.targetDurationMinutes,
      customInstructions: instructions?.customInstructions,
    });
    const citationRulesSection = PresentationPromptBuilder.formatCitationRules(snapshot.chunks.length === 0);

    const userPrompt = [
      `=== PRESENTATION PROJECT ===`,
      `Project Title: ${project.title}`,
      `Slide ${slide.slideIndex}${project.totalSlides ? ` of ${project.totalSlides}` : ""}`,
      ``,
      slideContextSection,
      ``,
      referenceContextSection,
      ``,
      styleSection,
      ``,
      citationRulesSection,
      ``,
      `=== OUTPUT INSTRUCTIONS ===`,
      `Generate the structured slide JSON adhering strictly to the JSON schema.`,
      language === "fa"
        ? `تمام متون، عنوان، ادعاها و یادداشت سخنران باید به زبان فارسی دقیق علمی نوشته شوند (اصطلاحات پزشکی و فنی انگلیسی می‌توانند در صورت نیاز در پرانتز آورده شوند).`
        : `All text, title, claims, and speaker notes must be in clear academic English.`,
    ].join("\n");

    return {
      systemPrompt,
      userPrompt,
      promptVersion: SLIDE_GENERATION_PROMPT_VERSION,
    };
  }

  /**
   * Builds a targeted prompt for Controlled Citation Repair (maximum 1 attempt).
   */
  static buildRepairPrompt(params: {
    slide: GeneratedPresentationSlide;
    snapshot: SlideReferenceContextSnapshot;
    validation: ServerCitationValidationResult;
    language?: string;
  }): GeneratedPromptResult {
    const { slide, snapshot, validation, language = "fa" } = params;

    const systemPrompt = [
      `You are the AVANA Presentation Citation Grounding Repair Specialist.`,
      `Your task is to fix citation integrity defects in a previously generated presentation slide.`,
      `You must strictly follow the provided Allowlist of Chunk IDs and Anti-Hallucination rules.`,
    ].join(" ");

    const allowlistChunkIds = snapshot.chunks.map((c) => c.chunkId);

    const failureDetails = validation.evaluatedCitations
      .filter((c) => c.status !== "valid")
      .map((c, i) => `${i + 1}. [Status: ${c.status}] ChunkId: "${c.chunkId || "NONE"}": ${c.detail}`)
      .join("\n");

    const userPrompt = [
      `=== CITATION VALIDATION DEFECTS DETECTED ===`,
      `The previous slide generation was rejected by the ServerCitationValidator due to the following defects:`,
      failureDetails || "Citation claims or citations array failed server validation.",
      ``,
      `=== STRICT ALLOWLIST OF VALID CHUNK IDS FOR THIS SLIDE ===`,
      allowlistChunkIds.length > 0
        ? allowlistChunkIds.map((id) => `- ${id}`).join("\n")
        : `(No external reference chunks exist for this slide. Citations list must be completely empty: []).`,
      ``,
      `=== APPROVED REFERENCE CHUNKS ===`,
      PresentationPromptBuilder.formatReferenceContext(snapshot.chunks),
      ``,
      `=== PREVIOUS GENERATION TO REPAIR ===`,
      JSON.stringify(slide, null, 2),
      ``,
      `=== REPAIR RULES ===`,
      `1. DO NOT invent or fabricate any new chunkId or referenceId. Only IDs in the Allowlist above are permitted.`,
      `2. For each claim with an invalid or unverified citation:`,
      `   a) If the claim is genuinely supported by one of the Allowed Chunk IDs above, change its chunkIds to that exact ID and set evidenceStatus="supported".`,
      `   b) If the claim is NOT directly supported by the allowed chunks, or if there is insufficient evidence, change evidenceStatus="insufficient_evidence" and set chunkIds=[].`,
      `3. DO NOT silently delete claims. Preserve the pedagogical explanations and educational structure.`,
      `4. In the top-level "citations" array, include ONLY chunk IDs that are actually referenced by supported claims. Remove any unused or extra citations.`,
      `5. Return the corrected complete GeneratedPresentationSlide JSON.`,
      language === "fa"
        ? `زبان اسلاید باید به زبان فارسی علمی و روان حفظ شود.`
        : `Slide language must remain in professional academic English.`,
    ].join("\n");

    return {
      systemPrompt,
      userPrompt,
      promptVersion: SLIDE_REPAIR_PROMPT_VERSION,
    };
  }

  // -------------------------------------------------------------------------
  // Private Formatting Helpers
  // -------------------------------------------------------------------------

  private static buildSpeakerSystemPrompt(language: string): string {
    const isFa = language === "fa";
    return [
      `You are the AVANA Scientific Presentation Assistant (دستیار ارائه علمی آوانا), an expert academic presenter, lecturer, and medical educator.`,
      `Your purpose is NOT to design or modify slide layouts. Instead, your mission is to prepare an authoritative, fluent, spoken presentation speech and delivery guide for an existing scientific slide, strictly grounded in the provided reference materials.`,
      isFa
        ? `شما برای اسلاید بارگذاری‌شده، متن کامل سخنرانی (Speech)، توضیحات تکمیلی علمی و پاتوفیزیولوژی، نکات کلیدی، مرواریدهای امتحانی و سناریوهای بالینی را به زبان فارسی سلیس و دانشگاهی نگارش می‌کنید.`
        : `You author complete oral lecture transcripts, in-depth scientific explanations, key takeaways, exam pearls, and clinical vignettes grounded in verified sources.`,
      `Output must always conform to the structured PresentationSpeakerContent JSON schema.`,
    ].join(" ");
  }

  private static formatSpeakerGuidelines(params: {
    projectTitle: string;
    totalSlides: number;
    slideIndex: number;
    isFirstSlide: boolean;
    isMiddleSlide: boolean;
    isFinalSlide: boolean;
    academicLevel: PresentationAcademicLevel;
    tone: PresentationTone;
    depth: PresentationElaborationDepth;
    targetDurationMinutes: number;
    customInstructions?: string;
    previousSlideSummary?: string | null;
    nextSlideTitle?: string | null;
    allSlidesOutline?: PresentationSlideOutlineItem[];
    coveredKeyConcepts?: string[];
    language: string;
  }): string {
    const lines = [
      `=== PRESENTATION SPEECH & DELIVERY GUIDELINES ===`,
      `Academic Level: ${params.academicLevel}`,
      `Tone: ${params.tone}`,
      `Elaboration Depth: ${params.depth}`,
      `Target Slide Delivery Time: ~${Math.max(1, Math.round(params.targetDurationMinutes / 10))} minutes (~60-180 seconds)`,
      `Slide Position in Narrative: Slide ${params.slideIndex} of ${params.totalSlides} [${
        params.isFirstSlide ? "FIRST / OPENING" : params.isFinalSlide ? "FINAL / CONCLUDING" : "MIDDLE / CONTINUATION"
      }]`,
    ];

    if (params.allSlidesOutline && params.allSlidesOutline.length > 0) {
      const outlineStr = params.allSlidesOutline
        .map((s) => `${s.slideIndex}. ${s.title || "بدون عنوان"}`)
        .join(" | ");
      lines.push(`Presentation Outline: [${outlineStr}]`);
    }

    if (params.coveredKeyConcepts && params.coveredKeyConcepts.length > 0) {
      lines.push(
        `Preceding Concepts Already Covered (DO NOT REPEAT DEFINITIONS): ${params.coveredKeyConcepts
          .slice(0, 6)
          .join(" | ")}`,
      );
    }

    if (params.previousSlideSummary && params.previousSlideSummary.trim().length > 0) {
      const trimmed = params.previousSlideSummary.trim();
      const bounded = trimmed.length > 350 ? `${trimmed.slice(0, 350)}...` : trimmed;
      lines.push(`Previous Slide Context: ${bounded}`);
    }

    if (params.nextSlideTitle && params.nextSlideTitle.trim().length > 0) {
      lines.push(`Next Slide Topic (for transitionSentence): ${params.nextSlideTitle.trim()}`);
    }

    if (params.language === "fa") {
      lines.push(``);
      lines.push(`=== الزامات یکپارچگی و پیوستگی تدریس (Presentation Continuity Directives) ===`);
      if (params.isFirstSlide) {
        lines.push(
          `* وضعیت اسلاید: اسلاید ۱ (آغازین ارائه).`,
          `* شروع: در صورت تناسب با لحن، با سلام و خوشامدگویی رسمی و کوتاه به مخاطبان آغاز کنید.`,
          `* معرفی: موضوع اصلی ارائه («${params.projectTitle}») و هدف کلی تدریس را در ابتدای کلام معرفی نمایید.`,
          `* از هرگونه مقدمه‌چینی مصنوعی، حاشیه‌ای یا بیش از حد طولانی اکیداً خودداری فرمایید.`,
        );
      } else if (params.isMiddleSlide) {
        lines.push(
          `* وضعیت اسلاید: اسلاید ${params.slideIndex} از ${params.totalSlides} (اسلاید میانی تدریس).`,
          `* ممنوعیت اکید سلام: هرگز مجدداً با سلام («سلام»، «درود»، «عرض ادب»، «خوش آمدید») شروع نکنید. این ارائه پیوسته است.`,
          `* ممنوعیت معرفی مجدد: نام خود، نام مدرس، یا معرفی تکراری موضوع را ابداً بازگو نکنید.`,
          `* آغاز پیوسته و طبیعی: کلام باید بی‌وقفه و به عنوان ادامه زنده و طبیعی صحبت قبلی شروع شود، گویی مدرس بدون مکث در حال تدریس نکته بعدی است.`,
          `* پرهیز از عبارات تکراری و کلیشه‌ای: از تکرار فرمول‌های قالبی مانند «در ادامه به بررسی...» یا «حال می‌پردازیم به...» در همه اسلایدها اکیداً اجتناب کنید. شروع‌ها باید متنوع، ارگانیک و طبیعی باشند (مثلاً با طرح مستقیم نکته کلیدی، بسط مکانیسم، یا استدلال بالینی).`,
          `* عدم تکرار: از تکرار مجدد تعاریف پایه، اصطلاحات اولیه و مطالبی که در اسلایدهای قبلی توضیح داده شده‌اند خودداری فرمایید.`,
        );
      } else if (params.isFinalSlide) {
        lines.push(
          `* وضعیت اسلاید: اسلاید پایانی ارائه (${params.slideIndex} از ${params.totalSlides}).`,
          `* ممنوعیت سلام یا شروع جدید: هرگز با سلام یا طرح مبحث جدید آغاز نکنید.`,
          `* جمع‌بندی جامع: این اسلاید پایان ارائه است؛ پیام کلیدی، دستاوردها و نتیجه‌گیری نهایی کل مباحث تدریس‌شده را به شکل منسجم و اثرگذار جمع‌بندی کنید.`,
          `* خاتمه و تشکر: در انتهای گفتار این اسلاید، با تشکر موقر از توجه مخاطبان و در صورت تناسب، دعوت به پرسش و پاسخ، سخنرانی را پایان دهید.`,
        );
      }

      if (params.depth === "comprehensive") {
        lines.push(
          `* عمق علمی ارائه (سطح عمیق - Comprehensive): تمام جزئیات تخصصی، مکانیسم‌های عمل، پاتوفیزیولوژی و نکات علمی پیشرفته را مستقیماً در بافت پاراگراف‌های speechText بسط دهید تا گفتار ارائه از غنای حداکثری برخوردار باشد.`,
        );
      }
    }

    if (params.customInstructions && params.customInstructions.trim().length > 0) {
      lines.push(`Custom Presenter Instructions:\n${params.customInstructions.trim()}`);
    }

    return lines.join("\n");
  }

  private static buildSystemPrompt(language: string): string {
    const isFa = language === "fa";
    return [
      `You are the AVANA Scientific Presentation Assistant, an expert medical and academic slide authoring engine.`,
      `Your purpose is to synthesize structured, high-yield presentation slides strictly grounded in verified reference materials.`,
      isFa
        ? `شما باید اسلایدهای آموزشی، مستند، دقیق و استاندارد تولید کنید که فقط بر اساس شواهد موجود در منابع ارائه‌شده نگارش شوند.`
        : `You generate authoritative, scientifically grounded presentation slides strictly anchored to approved references.`,
      `Output must always conform to the structured JSON schema.`,
    ].join(" ");
  }

  private static formatSlideContext(
    slide: Pick<PresentationSlideRecord, "slideIndex" | "title" | "rawText" | "speakerNotes" | "visualSummary">,
  ): string {
    const lines = [
      `=== SLIDE CONTEXT ===`,
      `Slide Index: ${slide.slideIndex}`,
      `Slide Title: ${slide.title ?? "(To be determined by model)"}`,
    ];

    if (slide.rawText && slide.rawText.trim().length > 0) {
      lines.push(`Existing / Draft Text:\n${slide.rawText.trim()}`);
    }

    if (slide.speakerNotes && slide.speakerNotes.trim().length > 0) {
      lines.push(`Speaker Notes Intent:\n${slide.speakerNotes.trim()}`);
    }

    if (slide.visualSummary && slide.visualSummary.trim().length > 0) {
      lines.push(`Visual Summary / Media Intent: ${slide.visualSummary.trim()}`);
    }

    return lines.join("\n");
  }

  private static formatReferenceContext(chunks: SnapshotReferenceChunk[]): string {
    if (chunks.length === 0) {
      return [
        `=== APPROVED REFERENCE CONTEXT ===`,
        `[NO EXTERNAL REFERENCE CHUNKS SELECTED FOR THIS SLIDE]`,
        `This slide serves as an introduction, overview, structural agenda, or pedagogical conclusion.`,
        `Do not cite any external sources. Citations array must be empty [].`,
      ].join("\n");
    }

    const lines = [
      `=== APPROVED REFERENCE CONTEXT (HISTORICAL SNAPSHOT) ===`,
      `The following ${chunks.length} reference chunks have been authoritatively selected for this slide:`,
      ``,
    ];

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const pageInfo =
        c.sourceLocation.startPage !== null
          ? `Pages ${c.sourceLocation.startPage}${c.sourceLocation.endPage && c.sourceLocation.endPage !== c.sourceLocation.startPage ? `-${c.sourceLocation.endPage}` : ""} (Confidence: ${c.sourceLocation.confidence})`
          : `Unpaged / Direct source (Confidence: ${c.sourceLocation.confidence})`;

      lines.push(`--- REFERENCE CHUNK [${i + 1}] ---`);
      lines.push(`Chunk ID: ${c.chunkId}`);
      lines.push(`Reference ID: ${c.referenceId}`);
      lines.push(`Citation Label: ${c.citationLabel}`);
      lines.push(`Source Title: ${c.sourceTitle}`);
      lines.push(`Location: ${pageInfo}`);
      lines.push(`Content:`);
      lines.push(c.content.trim());
      lines.push(``);
    }

    return lines.join("\n");
  }

  private static formatStyleGuidelines(params: {
    academicLevel: PresentationAcademicLevel;
    tone: PresentationTone;
    depth: PresentationElaborationDepth;
    targetDurationMinutes: number;
    customInstructions?: string;
  }): string {
    const lines = [
      `=== PRESENTATION STYLE GUIDELINES ===`,
      `Academic Level: ${params.academicLevel}`,
      `Tone: ${params.tone}`,
      `Elaboration Depth: ${params.depth}`,
      `Target Slide Duration: ~${Math.max(1, Math.round(params.targetDurationMinutes / 10))} minutes delivery per slide`,
    ];

    if (params.customInstructions && params.customInstructions.trim().length > 0) {
      lines.push(`Custom Instructions:\n${params.customInstructions.trim()}`);
    }

    return lines.join("\n");
  }

  private static formatCitationRules(isEmptySnapshot: boolean): string {
    if (isEmptySnapshot) {
      return [
        `=== STRICT CITATION & GROUNDING RULES (EMPTY SNAPSHOT) ===`,
        `1. This slide has NO external reference snapshot.`,
        `2. You MUST set citations: [] (empty array).`,
        `3. All claims in content items must either have chunkIds: [] and evidenceStatus="insufficient_evidence", or provide conceptual structural framing without scientific fact assertion.`,
        `4. NEVER invent or hallucinate chunk IDs or reference IDs.`,
      ].join("\n");
    }

    return [
      `=== STRICT CITATION & GROUNDING RULES ===`,
      `1. SOLE SOURCE OF TRUTH: Base all factual, scientific, and empirical statements strictly on the Approved Reference Context above.`,
      `2. ZERO EXTERNAL CITATIONS: Never cite sources from model pre-training, general memory, or external web.`,
      `3. CHUNK ID INTEGRITY: Every chunkId referenced in claims or citations MUST exist in the Approved Reference Context above. Never fabricate or invent IDs.`,
      `4. EVIDENCE STATUS:`,
      `   - If a claim is directly supported by a reference chunk, set evidenceStatus="supported" and provide the exact chunkId(s) in chunkIds.`,
      `   - If information is supplementary, pedagogical explanation, or lacks direct textual evidence in the provided chunks, you MUST set evidenceStatus="insufficient_evidence" and chunkIds=[].`,
      `5. NO UNUSED CITATIONS: Every chunkId listed in the top-level "citations" array MUST be referenced by at least one supported claim in the content. Do not include extra or decorative citations.`,
      `6. SPEAKER NOTES: Provide insightful, professional narration notes for the presenter elaborating on the slide points and clinical/academic implications.`,
    ].join("\n");
  }
}
