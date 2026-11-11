/**
 * Scientific Data Provider for AVANA Chemistry Engine.
 *
 * Fetches authoritative chemical structure data from scientific sources (PubChem PUG REST API).
 * Implements strict rate limiting (max 5 req/sec), bounded retries with backoff, AbortController timeouts,
 * and robust multi-candidate disambiguation.
 */

import type { ScientificCompoundData } from "./types.js";

export interface ScientificDataProvider {
  fetchCompoundByName(
    name: string,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<ScientificCompoundData | null>;

  fetchCompoundByCid(
    cid: number,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<ScientificCompoundData | null>;
}

interface PubChemPropertyRecord {
  CID: number;
  CanonicalSMILES?: string;
  IsomericSMILES?: string;
  MolecularFormula?: string;
  MolecularWeight?: string | number;
  InChIKey?: string;
  InChI?: string;
  IUPACName?: string;
  Title?: string;
}

interface PubChemPropertyResponse {
  PropertyTable?: {
    Properties?: PubChemPropertyRecord[];
  };
  Fault?: {
    Code?: string;
    Message?: string;
    Details?: string[];
  };
}

interface PubChemSynonymResponse {
  InformationList?: {
    Information?: Array<{
      CID: number;
      Synonym?: string[];
    }>;
  };
}

export class PubChemDataProvider implements ScientificDataProvider {
  private lastRequestTime = 0;
  private readonly minRequestIntervalMs: number;
  private readonly defaultTimeoutMs: number;
  private readonly baseUrl: string;

  constructor(options?: {
    minRequestIntervalMs?: number;
    defaultTimeoutMs?: number;
    baseUrl?: string;
  }) {
    // PubChem allows up to 5 requests per second -> minimum 200ms interval
    this.minRequestIntervalMs = options?.minRequestIntervalMs ?? 220;
    this.defaultTimeoutMs = options?.defaultTimeoutMs ?? 4500;
    this.baseUrl = (options?.baseUrl ?? "https://pubchem.ncbi.nlm.nih.gov/rest/pug").replace(/\/+$/, "");
  }

  /**
   * Serializes requests to respect PubChem's rate limit.
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    if (timeSinceLast < this.minRequestIntervalMs) {
      const waitTime = this.minRequestIntervalMs - timeSinceLast;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Executes a fetch request with timeout, rate-limiting, and 1 retry on 429/503.
   */
  private async executeFetch<T>(
    url: string,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<T | null> {
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.throttle();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Link external signal if provided
      if (options?.signal) {
        options.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }

      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "User-Agent": "AVANA-MedicinalChemistry/2.0 (Academic/Educational Platform)",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 200) {
          const data = (await response.json()) as T;
          return data;
        }

        if (response.status === 404) {
          // Compound not found in PubChem
          return null;
        }

        if ((response.status === 429 || response.status === 503) && attempt < maxAttempts) {
          // Rate limited or temporarily unavailable: wait with backoff before retry
          const backoff = 500 * attempt;
          await new Promise((resolve) => setTimeout(resolve, backoff));
          continue;
        }

        // Other non-200 status code
        return null;
      } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (attempt < maxAttempts && !(options?.signal?.aborted)) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }
        return null;
      }
    }

    return null;
  }

  /**
   * Resolves compound by English name from PubChem.
   * Disambiguates multiple candidate results to prevent incorrect attribution.
   */
  async fetchCompoundByName(
    name: string,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<ScientificCompoundData | null> {
    const trimmed = name?.trim();
    if (!trimmed) return null;

    const encoded = encodeURIComponent(trimmed);
    const propertiesUrl = `${this.baseUrl}/compound/name/${encoded}/property/CanonicalSMILES,IsomericSMILES,MolecularFormula,MolecularWeight,InChIKey,IUPACName,Title/JSON`;

    const result = await this.executeFetch<PubChemPropertyResponse>(propertiesUrl, options);
    if (!result?.PropertyTable?.Properties || result.PropertyTable.Properties.length === 0) {
      return null;
    }

    const propertiesList = result.PropertyTable.Properties;

    // Disambiguation: Select the exact or most reliable matching record
    const selectedRecord = await this.disambiguateCandidates(trimmed, propertiesList, options);
    if (!selectedRecord) {
      return null;
    }

    return this.mapPropertyRecordToScientificData(selectedRecord, trimmed);
  }

  /**
   * Fetches compound directly by PubChem CID.
   */
  async fetchCompoundByCid(
    cid: number,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<ScientificCompoundData | null> {
    if (!cid || cid <= 0) return null;

    const propertiesUrl = `${this.baseUrl}/compound/cid/${cid}/property/CanonicalSMILES,IsomericSMILES,MolecularFormula,MolecularWeight,InChIKey,IUPACName,Title/JSON`;
    const result = await this.executeFetch<PubChemPropertyResponse>(propertiesUrl, options);
    const record = result?.PropertyTable?.Properties?.[0];

    if (!record) return null;
    return this.mapPropertyRecordToScientificData(record, record.Title || String(cid));
  }

  /**
   * Disambiguates when multiple properties are returned for a single name query.
   * If there is genuine ambiguity, returns null to avoid attaching a wrong structure.
   */
  private async disambiguateCandidates(
    queryName: string,
    candidates: PubChemPropertyRecord[],
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<PubChemPropertyRecord | null> {
    if (candidates.length === 1) {
      return candidates[0];
    }

    const normQuery = this.normalizeName(queryName);

    // 1. Direct match on Title or IUPACName
    for (const c of candidates) {
      if (c.Title && this.normalizeName(c.Title) === normQuery) {
        return c;
      }
      if (c.IUPACName && this.normalizeName(c.IUPACName) === normQuery) {
        return c;
      }
    }

    // 2. Fetch synonyms for candidate CIDs to check exact synonym match
    for (const c of candidates.slice(0, 3)) {
      const synUrl = `${this.baseUrl}/compound/cid/${c.CID}/synonyms/JSON`;
      const synData = await this.executeFetch<PubChemSynonymResponse>(synUrl, options);
      const synonyms = synData?.InformationList?.Information?.[0]?.Synonym || [];

      const hasExactSynonym = synonyms.some(
        (syn) => this.normalizeName(syn) === normQuery,
      );
      if (hasExactSynonym) {
        return c;
      }
    }

    // Ambiguous results that cannot be conclusively matched -> reject to ensure zero false attribution
    return null;
  }

  private mapPropertyRecordToScientificData(
    record: PubChemPropertyRecord,
    originalQuery: string,
  ): ScientificCompoundData | null {
    const rawSmiles = record.IsomericSMILES || record.CanonicalSMILES;
    const inChIKey = record.InChIKey?.trim();
    const formula = record.MolecularFormula?.trim();

    if (!rawSmiles || !inChIKey || !formula) {
      return null;
    }

    // InChIKey format validation: 14 chars, hyphen, 10 chars, hyphen, 1 char (total 27 chars)
    if (!/^[A-Z]{14}-[A-Z]{10}-[A-Z]$/.test(inChIKey)) {
      return null;
    }

    const mw = typeof record.MolecularWeight === "number"
      ? record.MolecularWeight
      : parseFloat(record.MolecularWeight || "0");

    if (isNaN(mw) || mw <= 0) {
      return null;
    }

    const canonicalName = record.Title?.trim() || originalQuery.trim();

    return {
      cid: record.CID,
      canonicalName,
      canonicalSmiles: record.CanonicalSMILES || rawSmiles,
      isomericSmiles: record.IsomericSMILES,
      inChIKey,
      inChI: record.InChI,
      formula,
      molecularWeight: mw,
      iupacName: record.IUPACName,
      synonyms: [originalQuery, canonicalName].filter(Boolean),
      source: "pubchem",
      verifiedAt: new Date().toISOString(),
    };
  }

  private normalizeName(str: string): string {
    return str
      .toLowerCase()
      .replace(/[-_.,;:/[\]()|\\«»""''“”‘’؛،—–−•·*~?!]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}
