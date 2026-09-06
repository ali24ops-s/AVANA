/**
 * Canonical Callout Taxonomy & Definitions for AVANA Educational Content.
 *
 * Single Source of Truth shared across backend, worker, domain, and web.
 */

export type CalloutType =
  | "warning"
  | "common-mistake"
  | "important"
  | "tip"
  | "educational-tip"
  | "clinical-point"
  | "drug-application"
  | "contraindication"
  | "key-point"
  | "understanding"
  | "supplementary";

export type CalloutVariant =
  | "warning"
  | "important"
  | "tip"
  | "clinical-point"
  | "contraindication"
  | "key-point"
  | "understanding"
  | "supplementary";

export interface CalloutDefinition {
  type: CalloutType;
  variant: CalloutVariant;
  defaultTitle: string;
  aliases: string[];
}

export const CALLOUT_DEFINITIONS: Record<CalloutType, CalloutDefinition> = {
  warning: {
    type: "warning",
    variant: "warning",
    defaultTitle: "هشدار",
    aliases: ["هشدار", "اخطار", "warning", "caution"],
  },
  "common-mistake": {
    type: "common-mistake",
    variant: "warning",
    defaultTitle: "اشتباه رایج",
    aliases: ["اشتباه رایج", "اشتباه متداول", "common-mistake", "common mistake"],
  },
  important: {
    type: "important",
    variant: "important",
    defaultTitle: "نکته مهم",
    aliases: ["نکته مهم", "توجه مهم", "important"],
  },
  tip: {
    type: "tip",
    variant: "tip",
    defaultTitle: "نکته",
    aliases: ["نکته", "tip", "نکته آموزشی"],
  },
  "educational-tip": {
    type: "educational-tip",
    variant: "tip",
    defaultTitle: "نکته آموزشی",
    aliases: ["نکته آموزشی", "educational-tip"],
  },
  "clinical-point": {
    type: "clinical-point",
    variant: "clinical-point",
    defaultTitle: "نکته بالینی",
    aliases: ["نکته بالینی", "کاربرد بالینی", "clinical point", "clinical-point"],
  },
  "drug-application": {
    type: "drug-application",
    variant: "clinical-point",
    defaultTitle: "کاربرد دارویی نوین",
    aliases: ["کاربرد دارویی نوین", "کاربرد دارویی", "drug-application"],
  },
  contraindication: {
    type: "contraindication",
    variant: "contraindication",
    defaultTitle: "منع مصرف",
    aliases: ["منع مصرف", "موارد منع مصرف", "contraindication"],
  },
  "key-point": {
    type: "key-point",
    variant: "key-point",
    defaultTitle: "نکته کلیدی",
    aliases: ["نکته کلیدی", "نکات کلیدی", "key point", "key-point"],
  },
  understanding: {
    type: "understanding",
    variant: "understanding",
    defaultTitle: "برای فهم بهتر",
    aliases: ["برای فهم بهتر", "درک بهتر", "understanding"],
  },
  supplementary: {
    type: "supplementary",
    variant: "supplementary",
    defaultTitle: "توضیح تکمیلی",
    aliases: ["توضیح تکمیلی", "اطلاعات تکمیلی", "نکات تکمیلی", "supplementary"],
  },
};

/**
 * Resolves any string or alias into a canonical CalloutType.
 */
export function resolveCalloutType(input: string): CalloutType {
  const normalized = input.trim().toLowerCase().replace(/[_\s-]+/g, "-");
  if (normalized in CALLOUT_DEFINITIONS) {
    return normalized as CalloutType;
  }
  for (const [key, def] of Object.entries(CALLOUT_DEFINITIONS)) {
    if (def.aliases.some((alias) => alias.toLowerCase() === input.trim().toLowerCase())) {
      return key as CalloutType;
    }
  }
  return "tip";
}
