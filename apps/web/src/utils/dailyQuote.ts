import { useEffect, useState } from "react";

/**
 * Curated list of friendly, encouraging Persian motivational quotes
 * tailored for studying, learning, continuous improvement, and focus.
 * Contains 30 quotes (exceeding the >= 20 requirement).
 */
export const MOTIVATIONAL_QUOTES: readonly string[] = [
  "هر قدم کوچک امروز، موفقیت بزرگ فردای توست.",
  "استمرار و پیوستگی، کلید یادگیری عمیق و ماندگار است.",
  "یادگیری یک سفر بی‌پایان است؛ از هر لحظه مسیر لذت ببر.",
  "تلاش و تمرکز امروزت، آینده‌ات را روشن‌تر از همیشه می‌سازد.",
  "ذهن تو با هر کلمه‌ای که یاد می‌گیری، قدرتمندتر می‌شود.",
  "حتی بیست دقیقه مطالعه متمرکز، تغییری بزرگ ایجاد می‌کند.",
  "پشتکار یعنی ادامه دادن، حتی زمانی که مباحث آسان نیستند.",
  "امروز بهترین فرصت برای یاد گرفتن چیزهایی است که دیروز نمی‌دانستی.",
  "به توانایی‌های خودت ایمان داشته باش؛ تو از پسش برمی‌آیی.",
  "پیشرفت‌های کوچکِ هر روزه، نتایج شگفت‌انگیز می‌آفرینند.",
  "دانش تنها سرمایه‌ای است که با به اشتراک گذاشتن، بیشتر می‌شود.",
  "کیفیت مطالعه مهم‌تر از ساعت‌های آن است؛ هوشمندانه یاد بگیر.",
  "اشتباهات، نشانه‌های شجاعت تو در درک مفاهیم جدید هستند.",
  "به خودت افتخار کن که هر روز برای رشد فکری‌ات وقت می‌گذاری.",
  "با هر پرسش و چالش جدید، درک عمیق‌تری پیدا می‌کنی.",
  "انگیزه تو را به حرکت درمی‌آورد و عادت‌ها تو را به مقصد می‌رسانند.",
  "امروز با آرامش، اشتیاق و تمرکز کامل مطالعه را شروع کن.",
  "موفقیت یعنی تکرار منظم کارهای درست در طول زمان.",
  "هر صفحه‌ای که می‌خوانی، دریچه‌ای رو به افق‌های روشن‌تر است.",
  "فرصت‌های بزرگ در دل تلاش‌های روزمره و مداوم شکل می‌گیرند.",
  "ذهنت را برای یادگیری باز نگه دار؛ شگفتی‌ها در انتظار تو هستند.",
  "پیروزی از آنِ کسانی است که یادگیری را متوقف نمی‌کنند.",
  "امروز گامی هرچند کوچک به سوی هدف‌های ارزشمندت بردار.",
  "صبور باش؛ دانه‌های تلاشت به مرور به درختی تنومند تبدیل می‌شوند.",
  "لذت کشف و فهمیدن، بهترین پاداش مطالعه متمرکز است.",
  "برای شروع نیازی نیست عالی باشی، اما برای عالی شدن باید شروع کنی.",
  "قدرت اراده‌ات بیشتر از هر چالش و امتحان سختی است.",
  "هر روز با انگیزه یادگیری آغاز کن و با رضایت از پیشرفت به پایان برسان.",
  "آینده به کسانی تعلق دارد که به ارزش آموزش و رشد باور دارند.",
  "مطالعه امروز، سرمایه‌گذاری برای فردایی پربارتر و مطمئن‌تر است.",
];

/**
 * Returns a deterministic date key (YYYY-MM-DD) based on Asia/Tehran timezone.
 * This guarantees all users across any geographic location resolve to the exact
 * same calendar day in Iran.
 */
export function getTehranDateKey(date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const parts = formatter.formatToParts(date);
    let year = "";
    let month = "";
    let day = "";

    for (const part of parts) {
      if (part.type === "year") year = part.value;
      if (part.type === "month") month = part.value;
      if (part.type === "day") day = part.value;
    }

    if (year && month && day) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    const partsMap: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        partsMap[part.type] = part.value;
      }
    }
    if (partsMap.year && partsMap.month && partsMap.day) {
      return `${partsMap.year}-${partsMap.month.padStart(2, "0")}-${partsMap.day.padStart(2, "0")}`;
    }

    return date.toISOString().split("T")[0]!;
  } catch {
    // Fallback for environments without Intl timezone support
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
}

/**
 * 32-bit FNV-1a non-cryptographic hash function.
 * Produces a stable, deterministic integer for a given string key.
 */
export function hashString(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Calculates a deterministic zero-based index for the day's quote.
 */
export function getDailyQuoteIndex(
  dateKey: string,
  totalQuotes: number = MOTIVATIONAL_QUOTES.length,
): number {
  if (totalQuotes <= 0) return 0;
  const hash = hashString(dateKey);
  return hash % totalQuotes;
}

/**
 * Retrieves the daily motivational quote for a given date in Asia/Tehran timezone.
 * Pure and deterministic: identical date input always produces the identical quote.
 */
export function getDailyMotivationalQuote(
  date: Date = new Date(),
  quotes: readonly string[] = MOTIVATIONAL_QUOTES,
): string {
  if (!quotes || quotes.length === 0) {
    return "";
  }
  const dateKey = getTehranDateKey(date);
  const index = getDailyQuoteIndex(dateKey, quotes.length);
  return quotes[index] ?? quotes[0] ?? "";
}

/**
 * Computes milliseconds remaining until next midnight in Asia/Tehran timezone.
 * Useful for scheduling automatic daily quote transitions when a tab stays open.
 */
export function getMsUntilNextTehranMidnight(now: Date = new Date()): number {
  try {
    const tehranFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tehran",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });
    const parts = tehranFormatter.formatToParts(now);
    const partMap: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== "literal") {
        partMap[p.type] = parseInt(p.value, 10);
      }
    }
    const h = partMap.hour ?? now.getHours();
    const m = partMap.minute ?? now.getMinutes();
    const s = partMap.second ?? now.getSeconds();

    const secondsPassed = (h % 24) * 3600 + m * 60 + s;
    const secondsRemaining = 86400 - secondsPassed;
    // Add 1 second buffer after midnight to ensure date has fully turned
    return Math.max(1000, (secondsRemaining + 1) * 1000);
  } catch {
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1,
    );
    return Math.max(1000, nextMidnight.getTime() - now.getTime());
  }
}

/**
 * React hook that returns the dynamic Persian motivational quote for the current day.
 *
 * Automatically updates at Tehran midnight without polling or unnecessary re-renders.
 * Also refreshes immediately when the tab becomes active or visible.
 */
export function useDailyMotivationalQuote(
  quotes: readonly string[] = MOTIVATIONAL_QUOTES,
): string {
  const [quote, setQuote] = useState<string>(() =>
    getDailyMotivationalQuote(new Date(), quotes),
  );

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const scheduleMidnightUpdate = () => {
      const now = new Date();
      const msUntilMidnight = getMsUntilNextTehranMidnight(now);

      timerId = setTimeout(() => {
        setQuote(getDailyMotivationalQuote(new Date(), quotes));
        scheduleMidnightUpdate();
      }, msUntilMidnight);
    };

    scheduleMidnightUpdate();

    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        setQuote(getDailyMotivationalQuote(new Date(), quotes));
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleVisibilityOrFocus);
    }

    return () => {
      if (timerId !== null) {
        clearTimeout(timerId);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleVisibilityOrFocus);
      }
    };
  }, [quotes]);

  return quote;
}
