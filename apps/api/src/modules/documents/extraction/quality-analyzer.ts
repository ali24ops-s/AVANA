import type { ExtractionResult } from "./types.js";

export type QualityReport = {
  score: number;
  level: "excellent" | "medium" | "poor";
  metrics: {
    extractionHealth: number;
    characterHealth: number;
    textDensity: number;
    pageCoverage: number;
    noiseHealth: number;
  };
  warnings: string[];
};

export class QualityAnalyzer {
  static analyze(result: ExtractionResult): QualityReport {
    const totalPages = result.pages.length;
    
    if (totalPages === 0) {
      return {
        score: 0,
        level: "poor",
        metrics: {
          extractionHealth: 0,
          characterHealth: 0,
          textDensity: 0,
          pageCoverage: 0,
          noiseHealth: 0
        },
        warnings: ["No pages found in the document."]
      };
    }

    let totalChars = 0;
    let emptyPages = 0;
    let corruptedChars = 0;
    
    // Configurable thresholds
    const MIN_CHARS_PER_PAGE = 50;
    const OPTIMAL_CHARS_PER_PAGE = 800; // Expected text density

    for (const page of result.pages) {
      const text = page.rawText || "";
      const len = text.trim().length;
      totalChars += len;
      
      if (len < MIN_CHARS_PER_PAGE) {
        emptyPages++;
      }
      
      // Count unicode replacement characters and control characters (excluding newline \x0A and tab \x09)
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (
          code === 0xfffd ||
          (code >= 0x00 && code <= 0x08) ||
          (code >= 0x0b && code <= 0x0c) ||
          (code >= 0x0e && code <= 0x1f)
        ) {
          corruptedChars++;
        }
      }
    }

    const usablePages = totalPages - emptyPages;
    
    // 1. Extraction Health (20%)
    // Is extraction completely empty?
    let extractionHealth = totalChars > 0 ? 100 : 0;
    if (usablePages === 0 && totalPages > 0) {
      extractionHealth = Math.max(0, extractionHealth - 80);
    }

    // 2. Page Coverage (20%)
    const coverageRatio = usablePages / totalPages;
    const pageCoverage = Math.round(coverageRatio * 100);

    // 3. Text Density (25%)
    let textDensity = 0;
    if (usablePages > 0) {
      const avgCharsPerPage = totalChars / usablePages;
      textDensity = Math.min(100, Math.round((avgCharsPerPage / OPTIMAL_CHARS_PER_PAGE) * 100));
      // Boost slightly if it's very dense
      if (avgCharsPerPage > OPTIMAL_CHARS_PER_PAGE) textDensity = 100;
    }

    // 4. Character/Encoding Health (20%)
    // If more than 5% of characters are corrupted, score drops to 0.
    let characterHealth = 100;
    if (totalChars > 0) {
      const corruptedRatio = corruptedChars / totalChars;
      characterHealth = Math.max(0, Math.round(100 - (corruptedRatio * 2000))); // 5% corruption = 100% penalty
    }

    // 5. Garbage / Noise Health (15%)
    let noiseHealth = 100;
    const noiseWarnings: string[] = [];
    
    if (totalChars > 0) {
      const combinedText = result.pages.map(p => p.rawText).join("\n");
      
      // Check for excessive repeating characters (e.g., ".......", "-------")
      const repeatingCharsMatch = combinedText.match(/(.)\1{10,}/g);
      if (repeatingCharsMatch) {
        const repeatingLength = repeatingCharsMatch.reduce((acc, match) => acc + match.length, 0);
        const repeatingRatio = repeatingLength / totalChars;
        if (repeatingRatio > 0.05) {
          noiseHealth = Math.max(0, noiseHealth - 30);
          noiseWarnings.push("High amount of repeating characters detected.");
        }
      }

      // Check for excessive whitespace
      const whitespaceMatch = combinedText.match(/\s+/g);
      if (whitespaceMatch) {
        const whitespaceLength = whitespaceMatch.reduce((acc, match) => acc + match.length, 0);
        const whitespaceRatio = whitespaceLength / totalChars;
        if (whitespaceRatio > 0.4) { // More than 40% of text is whitespace
          noiseHealth = Math.max(0, noiseHealth - 20);
          noiseWarnings.push("Unusually high amount of whitespace detected.");
        }
      }
    } else {
      noiseHealth = 0;
    }

    // Calculate Base Score (Max 100)
    // We weight Density (60) and Coverage (40) as the foundational quality of the text
    const baseScore = (pageCoverage * 0.4) + (textDensity * 0.6);

    // Apply Severe Penalties for Garbage/Noise/Corruption
    let penalty = 0;

    // 1. Corruption Penalty
    if (totalChars > 0) {
      const corruptedRatio = corruptedChars / totalChars;
      // 5% corruption is enough to completely ruin the text (5% * 2000 = 100 penalty)
      penalty += Math.min(100, corruptedRatio * 2000);
    }

    // 2. Noise Penalty
    if (noiseHealth < 100) {
      // noiseHealth drops by 30 for repeats, 20 for whitespace
      penalty += (100 - noiseHealth); 
    }

    // 3. Extraction Failure / Image-only Penalty
    if (totalPages > 0 && totalChars < totalPages * MIN_CHARS_PER_PAGE) {
      // Extremely low text overall suggests OCR failure or image-only PDF
      penalty += 50;
      if (!noiseWarnings.includes("Text extraction unavailable or image-only document.")) {
         noiseWarnings.push("Text extraction unavailable or image-only document.");
      }
    }

    const finalScore = Math.max(0, Math.round(baseScore - penalty));

    // Determine Level
    let level: "excellent" | "medium" | "poor" = "poor";
    if (finalScore >= 80) level = "excellent";
    else if (finalScore >= 50) level = "medium";

    // Warnings
    const warnings: string[] = [...noiseWarnings];
    if (emptyPages > 0) warnings.push(`Found ${emptyPages} pages with little to no text.`);
    if (corruptedChars > 0) warnings.push(`Found ${corruptedChars} corrupted or unreadable characters.`);
    if (textDensity < 50) warnings.push("Text density is unusually low for this document.");

    return {
      score: finalScore,
      level,
      metrics: {
        extractionHealth,
        characterHealth,
        textDensity,
        pageCoverage,
        noiseHealth
      },
      warnings
    };
  }
}
