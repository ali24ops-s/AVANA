/**
 * Dedicated Public Terms of Service Page (قوانین و مقررات استفاده از آوانا).
 *
 * Route: `/terms` (and alias `/terms-of-service`)
 *
 * Features:
 * - Production-ready, accessible, clean RTL layout matching AVANA Design System.
 * - 14 fully-specified, professional legal & educational sections tailored for AVANA.
 * - Prominent Medical Disclaimer callout card.
 * - Responsive Table of Contents (Desktop sticky sidebar & Mobile quick navigator).
 * - Extensible and maintainable Last Updated Date structure.
 * - Clean navigation back to home / landing.
 */

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  GraduationCap,
  AlertTriangle,
  UserCheck,
  Ban,
  Sparkles,
  UploadCloud,
  Copyright,
  CreditCard,
  UserX,
  RefreshCw,
  Scale,
  Shield,
  HelpCircle,
  ArrowRight,
  ChevronUp,
  Calendar,
  Layers,
  FileText,
} from "lucide-react";
import { BrandLogo } from "../components/brand/BrandLogo.js";

/**
 * Maintainable date configuration for Terms of Service updates.
 */
export const TERMS_LAST_UPDATED = {
  persianDate: "۱۱ شهریور ۱۴۰۵",
  gregorianDate: "سپتامبر ۲۰۲۶",
  fullDisplay: "۱۱ شهریور ۱۴۰۵ (سپتامبر ۲۰۲۶)",
  isoDate: "2026-09-01",
};

export interface TermsSection {
  id: string;
  number: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  isCriticalAlert?: boolean;
  intro?: string;
  items?: string[];
  subsections?: {
    subtitle?: string;
    paragraphs?: string[];
    items?: string[];
  }[];
  summaryCallout?: string;
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    id: "acceptance",
    number: "۱",
    title: "مقدمه و پذیرش قوانین",
    icon: ShieldCheck,
    intro:
      "به سامانه آموزشی آوانا خوش آمدید. استفاده از خدمات، محتوا، ابزارها و وب‌سایت آوانا منوط به رعایت شرایط و ضوابط مندرج در این سند است.",
    items: [
      "ثبت‌نام، ورود به حساب کاربری یا استفاده از امکانات پلتفرم آوانا به منزله مطالعه، آگاهی و پذیرش این قوانین و مقررات است.",
      "کاربران موظفند پیش از استفاده از خدمات، این شرایط را مطالعه نمایند.",
      "در صورت عدم موافقت با هر یک از مفاد این سند، کاربر نباید از خدمات و محتوای آوانا استفاده کند.",
    ],
  },
  {
    id: "services-definition",
    number: "۲",
    title: "تعریف آوانا و دامنه خدمات",
    icon: GraduationCap,
    intro:
      "آوانا یک پلتفرم آموزشی و کمک‌آموزشی تخصصی برای دانشجویان، پژوهشگران و علاقه‌مندان حوزه علوم دارویی و سلامت است. خدمات پلتفرم ممکن است شامل موارد زیر باشد:",
    items: [
      "دوره‌ها، ماژول‌ها و درسنامه‌های آموزشی ساختاریافته و دسته‌بندی‌شده.",
      "ابزارهای مطالعه و مرور محتوای آموزشی و فلش‌کارت‌ها.",
      "بانک کوئیزها، آزمون‌ها و ارزیابی‌های آموزشی متناسب با مباحث درسی.",
      "امکان بارگذاری و سازماندهی فایل‌ها و منابع آموزشی شخصی توسط کاربر.",
      "ابزارهای خلاصه‌سازی و دستیار تعاملی هوشمند برای رفع اشکال و تسهیل یادگیری.",
      "بسته‌های آموزشی و منابع به اشتراک گذاشته شده در کتابخانه محتوا.",
      "سیستم مدیریت حساب کاربری، پیگیری روند مطالعه و پلن‌های دسترسی به خدمات.",
    ],
  },
  {
    id: "medical-disclaimer",
    number: "۳",
    title: "ماهیت آموزشی و سلب مسئولیت پزشکی",
    icon: AlertTriangle,
    isCriticalAlert: true,
    intro:
      "با توجه به ماهیت تخصصی علوم دارویی و پزشکی، لطفاً به نکات زیر توجه ویژه داشته باشید:",
    subsections: [
      {
        subtitle: "صرفاً جنبه آموزشی و کمک‌آموزشی",
        paragraphs: [
          "کلیه محتواها، درسنامه‌ها، فلش‌کارت‌ها، آزمون‌ها، خلاصه‌ها و پاسخ‌های دستیار هوشمند در آوانا صرفاً با اهداف آموزشی، پژوهشی و کمک‌آموزشی ارائه می‌شوند.",
          "اطلاعات ارائه‌شده در آوانا به هیچ وجه جایگزین نظر، تشخیص بالینی، نسخه، پروتکل درمانی یا مشاوره تخصصی پزشک، داروساز یا متخصصان واجد صلاحیت نیست.",
        ],
      },
      {
        subtitle: "احتمال خطا و محدودیت‌های محتوا",
        paragraphs: [
          "خروجی‌های هوش مصنوعی و محتوای ارائه‌شده ممکن است با وجود دقت در طراحی، دارای خطا، کاستی، عدم انطباق یا اطلاعات ناکامل باشند.",
          "کاربران نباید صرفاً بر اساس اطلاعات موجود در این پلتفرم اقدام به تصمیم‌گیری پزشکی، درمانی، تجویز دارو، تنظیم دوز یا تشخیص بالینی نمایند.",
        ],
      },
      {
        subtitle: "لزوم تطبیق با مراجع معتبر",
        paragraphs: [
          "بررسی و تطبیق اطلاعات مربوط به داروها، دوزاژ، منع مصرف، بیماری‌ها و تداخلات دارویی با منابع علمی رسمی و معتبر و نظر متخصصان الزامی است.",
          "مسئولیت هرگونه تصمیم حرفه‌ای، درمانی یا بالینی بر عهده کاربر و متخصصان مربوطه است.",
        ],
      },
    ],
  },
  {
    id: "user-accounts",
    number: "۴",
    title: "حساب کاربری و امنیت",
    icon: UserCheck,
    intro:
      "ایجاد و مدیریت حساب کاربری در آوانا تابع ضوابط زیر است:",
    items: [
      "کاربر متعهد است در هنگام ثبت‌نام، نشانی ایمیل و مشخصات صحیح و معتبر وارد نماید.",
      "مسئولیت حفظ محرمانگی نام کاربری، رمز عبور و امنیت نشست‌های حساب بر عهده کاربر است.",
      "کاربر نباید حساب کاربری خود را در اختیار دیگران قرار دهد و استفاده اشتراکی غیرمجاز از حساب ممنوع است.",
      "فعالیت‌های انجام‌شده از طریق حساب کاربری به دارنده حساب منتسب می‌شود.",
      "در صورت مشاهده هرگونه دسترسی غیرمجاز یا فعالیت مشکوک، کاربر باید در اسرع وقت اقدام به تغییر رمز عبور نموده و موضوع را به پشتیبانی اطلاع دهد.",
    ],
  },
  {
    id: "acceptable-use",
    number: "۵",
    title: "ضوابط استفاده مجاز و رفتارهای ممنوعه",
    icon: Ban,
    intro:
      "کاربران مجازند صرفاً در چارچوب اهداف فردی و آموزشی از خدمات پلتفرم استفاده نمایند. رفتارهای زیر غیرمجاز هستند:",
    items: [
      "تلاش برای نفوذ، ایجاد اختلال در دسترسی، اسکن امنیتی بدون مجوز یا دور زدن محدودیت‌های فنی سامانه.",
      "استخراج خودکار و گسترده داده‌ها (Scraping) یا استفاده از ابزارهای خودکار بدون هماهنگی مکتوب.",
      "مهندسی معکوس، کپی‌برداری یا بازتولید ساختار نرم‌افزاری و رابط‌های برنامه‌نویسی پلتفرم.",
      "بهره‌برداری تجاری، بازنشر گسترده یا فروش محتوای اختصاصی پلتفرم بدون مجوز.",
      "بارگذاری فایل‌های مخرب یا هرگونه فعالیتی که موجب آسیب به سامانه یا تضییع حقوق دیگران شود.",
    ],
  },
  {
    id: "ai-content",
    number: "۶",
    title: "محتوای تولیدشده توسط هوش مصنوعی",
    icon: Sparkles,
    intro:
      "در خصوص بخش‌هایی از محتوا و ابزارهای آوانا که با استفاده از هوش مصنوعی پردازش یا تولید می‌شوند:",
    items: [
      "بخشی از درسنامه‌ها، خلاصه‌ها، فلش‌کارت‌ها و پاسخ‌های تعاملی توسط فناوری هوش مصنوعی پردازش یا بازآفرینی می‌شوند.",
      "خروجی هوش مصنوعی ممکن است دارای اشتباه، سوگیری مفهومی یا اطلاعات ناقص باشد و صحت کامل علمی آن تضمین نمی‌گردد.",
      "کاربران موظفند نکات مهم و حساس علمی را همواره با کتب مرجع و منابع درسی معتبر ارزیابی و بررسی نمایند.",
      "هوش مصنوعی یک ابزار کمکی آموزشی است و نباید به عنوان مرجع قطعی یا نهایی تصمیم‌گیری‌های درمانی و دارویی تلقی شود.",
      "پردازش داده‌ها صرفاً در حدود لازم برای ارائه و بهبود خدمات آموزشی به کاربر انجام می‌گیرد.",
    ],
  },
  {
    id: "user-uploads",
    number: "۷",
    title: "مسئولیت محتوا و فایل‌های بارگذاری‌شده",
    icon: UploadCloud,
    intro:
      "در صورت بارگذاری فایل‌ها، جزوات و اسناد آموزشی توسط کاربران:",
    items: [
      "مالکیت محتوایی که کاربر حق قانونی آن را دارد، برای کاربر باقی می‌ماند و کاربر صرفاً مجوز محدودی را که برای ذخیره، پردازش و ارائه خدمات لازم است به آوانا می‌دهد.",
      "مسئولیت داشتن حقوق قانونی و رعایت مالکیت فکری در فایل‌های بارگذاری‌شده تماماً بر عهده خود کاربر است.",
      "کاربر متعهد است از بارگذاری فایل‌های ناقض قوانین، اسناد غیرمجاز یا ناقض حریم خصوصی دیگران خودداری نماید.",
      "آوانا این حق را دارد که در صورت دریافت گزارش موثق از نقض حقوق یا تخلف از ضوابط، دسترسی به فایل مربوطه را محدود یا آن را حذف نماید.",
    ],
  },
  {
    id: "intellectual-property",
    number: "۸",
    title: "حقوق مالکیت فکری و معنوی",
    icon: Copyright,
    intro:
      "حقوق معنوی و دارایی‌های پلتفرم آوانا به شرح زیر محافظت می‌شوند:",
    items: [
      "نام تجاری، نشان تجاری، طراحی رابط کاربری، کدها، معماری فنی و محتواهای اختصاصی تولیدشده متعلق به آوانا است.",
      "استفاده از خدمات به معنای انتقال حقوق مالکیت فکری به کاربر نبوده و کپی‌برداری یا استفاده تجاری از محتوای اختصاصی بدون کسب مجوز ممنوع است.",
      "حقوق مالکیت معنوی کتب، مقالات و منابع مرجع متعلق به پدیدآورندگان اصلی آن‌ها است.",
    ],
  },
  {
    id: "subscriptions-billing",
    number: "۹",
    title: "اشتراک‌ها، پرداخت‌ها و خدمات مالی",
    icon: CreditCard,
    intro:
      "در صورت استفاده از خدمات یا پلن‌های مشمول هزینه در پلتفرم:",
    items: [
      "قیمت، مدت اعتبار، سطح دسترسی و امکانات هر پلن پیش از انجام تراکنش به صورت شفاف به کاربر نمایش داده می‌شود.",
      "دسترسی به خدمات پس از تکمیل فرآیند پرداخت فعال می‌گردد.",
      "شرایط اختصاصی مربوط به هر خرید در زمان سفارش به اطلاع کاربر می‌رسد.",
      "درخواست‌های احتمالی لغو یا بازگشت وجه، با توجه به شرایط اعلام‌شده در زمان خرید توسط بخش پشتیبانی بررسی و پیگیری می‌شود.",
    ],
  },
  {
    id: "account-suspension",
    number: "۱۰",
    title: "تعلیق یا محدودسازی حساب کاربری",
    icon: UserX,
    intro:
      "به منظور حفظ امنیت و آرامش فضای یادگیری کاربران:",
    items: [
      "در صورت نقض این قوانین، سوءاستفاده از خدمات یا بروز اقدامات مخل امنیت سامانه، آوانا ممکن است دسترسی کاربر را موقتاً یا دائماً محدود نماید.",
      "اقدامات نظارتی با رعایت اصول منصفانه و در جهت محافظت از حقوق جامعه کاربران انجام می‌شود.",
      "کاربران می‌توانند در صورت نیاز به بررسی مجدد، موضوع را از طریق پشتیبانی پیگیری نمایند.",
    ],
  },
  {
    id: "terms-modifications",
    number: "۱۱",
    title: "تغییرات و به‌روزرسانی قوانین",
    icon: RefreshCw,
    intro:
      "با توجه به توسعه امکانات و تغییرات فنی، این سند ممکن است در طول زمان به‌روزرسانی شود:",
    items: [
      "در صورت اعمال تغییرات بااهمیت، تاریخ آخرین به‌روزرسانی در بالای این صفحه منعکس شده و اطلاع‌رسانی مقتضی در سامانه انجام خواهد شد.",
      "کاربران می‌توانند همواره به آخرین نسخه قوانین در این صفحه دسترسی داشته باشند.",
      "استمرار استفاده از خدمات پس از انتشار تغییرات، نشان‌دهنده اطلاع و موافقت کاربر با شرایط به‌روزرسانی‌شده خواهد بود.",
    ],
  },
  {
    id: "liability-limits",
    number: "۱۲",
    title: "محدودیت مسئولیت و تداوم خدمات",
    icon: Scale,
    intro:
      "آوانا تمام تلاش معقول خود را برای ارائه خدماتی باکیفیت، امن و پایدار به کار می‌بندد؛ با این حال:",
    items: [
      "ارائه خدمات آنلاین ممکن است در مواردی با اختلالات مقطعی ناشی از شبکه اینترنت یا اقدامات ارتقای فنی همراه شود.",
      "آوانا در قبال پیامدهای ناشی از اختلالات خارج از کنترل شبکه، وقفه در دسترسی یا سوءبرداشت از محتواهای آموزشی، مسئولیتی خارج از حدود متعارف ارائه خدمات آموزشی نخواهد داشت.",
      "کاربران باید تصمیمات مهم تحصیلی، دانشگاهی یا حرفه‌ای خود را با مشورت مراجع درسی رسمی و اساتید مربوطه تنظیم نمایند.",
    ],
  },
  {
    id: "privacy-reference",
    number: "۱۳",
    title: "حفاظت از داده‌ها و حریم خصوصی",
    icon: Shield,
    intro:
      "حفظ اطلاعات و امنیت داده‌های کاربران از اولویت‌های بنیادین آوانا است:",
    items: [
      "اطلاعات حساب کاربری و داده‌های تحصیلی صرفاً در جهت ارائه خدمات، احراز هویت و تسهیل یادگیری مورد استفاده قرار می‌گیرند.",
      "تمهیدات استاندارد فنی و رویه‌ای برای محافظت از اطلاعات و جلوگیری از دسترسی‌های غیرمجاز به کار بسته می‌شود.",
      "در صورت تدوین و انتشار مستندات تکمیلی حریم خصوصی، مراتب از طریق سامانه به اطلاع کاربران خواهد رسید.",
    ],
  },
  {
    id: "contact-support",
    number: "۱۴",
    title: "ارتباط و پاسخگویی به سوالات",
    icon: HelpCircle,
    intro:
      "در صورت وجود هرگونه پرسش، پیشنهاد، ابهام یا گزارش در خصوص قوانین و مقررات پلتفرم:",
    items: [
      "کاربران می‌توانند از طریق بخش پشتیبانی درون سامانه با تیم آوانا در ارتباط باشند.",
      "پیام‌ها و درخواست‌های ارسالی توسط تیم پشتیبانی بررسی و پاسخ داده خواهند شد.",
    ],
  },
];

export function TermsPage() {
  const [activeSectionId, setActiveSectionId] = useState<string>("acceptance");
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    document.title = "قوانین و مقررات استفاده | آوانا";
    try {
      if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        window.scrollTo(0, 0);
      }
    } catch {
      // Ignore in environments without full window.scrollTo support (e.g. JSDOM)
    }

    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);

      // Track active section for TOC
      const scrollPosition = window.scrollY + 200;
      for (let i = TERMS_SECTIONS.length - 1; i >= 0; i--) {
        const section = document.getElementById(TERMS_SECTIONS[i].id);
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSectionId(TERMS_SECTIONS[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 90;
      try {
        if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
          window.scrollTo({ top, behavior: "smooth" });
        }
      } catch {
        // Fallback for jsdom
      }
    }
  };

  const scrollToTop = () => {
    try {
      if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      // Fallback for jsdom
    }
  };

  return (
    <div
      className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] font-body selection:bg-[#008080]/20 selection:text-[#008080]"
      dir="rtl"
    >
      {/* 1. Header Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[var(--color-surface)]/90 border-b border-[var(--color-border)] w-full shadow-xs backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BrandLogo linkTo="/" variant="logo-only" size="md" />
            <div className="hidden sm:flex items-center gap-2 pr-4 border-r border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)]">
              <FileText className="w-4 h-4 text-[#008080]" />
              <span>مستندات قانونی و شرایط استفاده</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] text-xs sm:text-sm font-semibold text-[var(--color-text)] hover:text-[#008080] bg-[var(--color-surface-warm)] hover:bg-slate-200/70 border border-[var(--color-border)] transition-all cursor-pointer"
            >
              <span>بازگشت به صفحه اصلی</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* 2. Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-10 border-b border-[var(--color-border)] bg-gradient-to-b from-[var(--color-surface-warm)] via-[var(--color-bg-default)] to-[var(--color-bg-default)]">
        {/* Subtle Background Glows */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[250px] bg-[#008080]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-0 right-1/4 w-[350px] h-[200px] bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#008080]/10 text-[#008080] border border-[#008080]/20 text-xs font-bold shadow-xs">
            <ShieldCheck className="w-4 h-4 text-[#008080]" />
            <span>ضوابط و شرایط استفاده رسمی</span>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-[var(--color-text)] tracking-tight leading-tight">
            قوانین و مقررات استفاده از آوانا
          </h1>

          <p className="text-xs sm:text-base text-[var(--color-text-muted)] max-w-2xl mx-auto leading-relaxed">
            لطفاً پیش از استفاده از خدمات، محتوا و ابزارهای سامانه هوشمند آموزش داروسازی آوانا، شرایط و ضوابط زیر را با دقت مطالعه فرمایید.
          </p>

          <div className="pt-2 flex items-center justify-center gap-2 text-xs text-[var(--color-text-muted)]">
            <Calendar className="w-3.5 h-3.5 text-[#008080]" />
            <span className="font-medium">
              آخرین به‌روزرسانی:{" "}
              <strong className="text-[var(--color-text)] font-bold" data-testid="last-updated-date">
                {TERMS_LAST_UPDATED.fullDisplay}
              </strong>
            </span>
          </div>
        </div>
      </section>

      {/* 3. Mobile Table of Contents Quick Navigator */}
      <div className="lg:hidden sticky top-20 z-30 bg-[var(--color-surface)]/95 backdrop-blur-md border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] font-bold text-[var(--color-text-muted)] shrink-0 ml-1">
            فهرست بخش‌ها:
          </span>
          {TERMS_SECTIONS.map((sec) => {
            const isActive = activeSectionId === sec.id;
            return (
              <button
                key={sec.id}
                onClick={() => scrollToSection(sec.id)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-[6px] shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#008080]/15 text-[#008080] border border-[#008080]/30 font-bold"
                    : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]"
                }`}
              >
                {sec.number}. {sec.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Main Body Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Desktop Sticky Table of Contents (Right side in RTL) */}
          <aside className="hidden lg:block lg:col-span-4 sticky top-28 space-y-4">
            <div className="rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 shadow-xs">
              <div className="flex items-center gap-2 text-sm font-black text-[var(--color-text)] pb-3 mb-3 border-b border-[var(--color-border)]">
                <Layers className="w-4 h-4 text-[#008080]" />
                <span>فهرست عناوین و بخش‌ها</span>
              </div>

              <nav className="space-y-1 max-h-[calc(100vh-180px)] overflow-y-auto pr-1" aria-label="فهرست قوانین">
                {TERMS_SECTIONS.map((sec) => {
                  const isActive = activeSectionId === sec.id;
                  const Icon = sec.icon;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => scrollToSection(sec.id)}
                      className={`w-full text-right flex items-center justify-between gap-3 px-3 py-2 rounded-[8px] text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? "bg-[#008080]/10 text-[#008080] border border-[#008080]/25 shadow-xs font-bold"
                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-slate-100/70 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isActive ? "text-[#008080]" : "text-[var(--color-text-muted)]"
                          } ${sec.isCriticalAlert ? "text-amber-600" : ""}`}
                        />
                        <span className="truncate">{sec.title}</span>
                      </div>
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-[4px] ${
                          isActive
                            ? "bg-[#008080]/20 text-[#008080]"
                            : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
                        }`}
                      >
                        بخش {sec.number}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Main Legal Content (Left side in RTL) */}
          <main className="lg:col-span-8 space-y-8">
            {TERMS_SECTIONS.map((section) => {
              const Icon = section.icon;

              if (section.isCriticalAlert) {
                return (
                  <article
                    key={section.id}
                    id={section.id}
                    className="rounded-[16px] border-2 border-amber-300 bg-amber-50/60 p-6 sm:p-8 shadow-xs space-y-6 scroll-mt-28"
                    aria-labelledby={`heading-${section.id}`}
                  >
                    {/* Header */}
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-[12px] bg-amber-100 border border-amber-300 text-amber-700 flex items-center justify-center shrink-0 shadow-xs">
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-2 text-xs font-bold text-amber-700">
                          <span>بخش {section.number}</span>
                          <span>•</span>
                          <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[10px] font-black border border-amber-300">
                            اخطار ویژه و بسیار مهم
                          </span>
                        </div>
                        <h2
                          id={`heading-${section.id}`}
                          className="text-xl sm:text-2xl font-black text-amber-950 tracking-tight"
                        >
                          {section.title}
                        </h2>
                      </div>
                    </div>

                    {/* Intro */}
                    {section.intro && (
                      <p className="text-xs sm:text-sm text-amber-900 leading-relaxed font-medium">
                        {section.intro}
                      </p>
                    )}

                    {/* Subsections */}
                    <div className="space-y-4">
                      {section.subsections?.map((sub, sIdx) => (
                        <div
                          key={sIdx}
                          className="p-4 sm:p-5 rounded-[12px] bg-white border border-amber-200 space-y-2.5 shadow-xs"
                        >
                          {sub.subtitle && (
                            <h3 className="text-xs sm:text-sm font-bold text-amber-800 flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              <span>{sub.subtitle}</span>
                            </h3>
                          )}
                          {sub.paragraphs?.map((p, pIdx) => (
                            <p
                              key={pIdx}
                              className="text-xs sm:text-sm text-amber-950/80 leading-relaxed"
                            >
                              {p}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </article>
                );
              }

              return (
                <article
                  key={section.id}
                  id={section.id}
                  className="rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] p-6 sm:p-8 space-y-5 shadow-xs scroll-mt-28"
                  aria-labelledby={`heading-${section.id}`}
                >
                  {/* Section Title */}
                  <div className="flex items-center gap-3.5 pb-4 border-b border-[var(--color-border)]">
                    <div className="w-10 h-10 rounded-[10px] bg-[#008080]/10 border border-[#008080]/20 text-[#008080] flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[11px] font-bold text-[#008080] block">
                        بخش {section.number}
                      </span>
                      <h2
                        id={`heading-${section.id}`}
                        className="text-lg sm:text-xl font-bold text-[var(--color-text)] tracking-tight"
                      >
                        {section.title}
                      </h2>
                    </div>
                  </div>

                  {/* Intro */}
                  {section.intro && (
                    <p className="text-xs sm:text-sm text-[var(--color-text)] leading-relaxed">
                      {section.intro}
                    </p>
                  )}

                  {/* Bullet items */}
                  {section.items && section.items.length > 0 && (
                    <ul className="space-y-2.5 pt-1">
                      {section.items.map((item, idx) => (
                        <li
                          key={idx}
                          className="flex items-start gap-3 text-xs sm:text-sm text-[var(--color-text)] leading-relaxed"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#008080] mt-2 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Subsections if any */}
                  {section.subsections && (
                    <div className="space-y-4 pt-2">
                      {section.subsections.map((sub, subIdx) => (
                        <div
                          key={subIdx}
                          className="p-4 rounded-[10px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-2"
                        >
                          {sub.subtitle && (
                            <h3 className="text-xs sm:text-sm font-bold text-[#008080]">
                              {sub.subtitle}
                            </h3>
                          )}
                          {sub.paragraphs?.map((p, pIdx) => (
                            <p
                              key={pIdx}
                              className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed"
                            >
                              {p}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}

            {/* Bottom Support Callout */}
            <div className="rounded-[16px] border border-[var(--color-border)] bg-gradient-to-r from-teal-50/80 via-[var(--color-surface-warm)] to-[var(--color-surface-warm)] p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-xs">
              <div className="space-y-2 text-center sm:text-right">
                <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
                  نیاز به راهنمایی یا مشاوره بیشتر دارید؟
                </h3>
                <p className="text-xs sm:text-sm text-[var(--color-text-muted)] max-w-xl">
                  تیم پشتیبانی آوانا آماده پاسخگویی به هرگونه ابهام، سوال یا درخواست شما درباره شرایط و قوانین سامانه است.
                </p>
              </div>

              <Link
                to="/"
                className="shrink-0 px-5 py-3 rounded-[10px] bg-[#008080] hover:bg-[#006666] active:bg-[#005050] text-white text-xs sm:text-sm font-bold shadow-sm transition-all cursor-pointer flex items-center gap-2"
              >
                <span>بازگشت به صفحه اصلی</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </main>
        </div>
      </div>

      {/* 5. Floating Back to Top Button */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          aria-label="بازگشت به بالای صفحه"
          className="fixed bottom-6 left-6 z-50 p-3 rounded-full bg-[#008080] hover:bg-[#006666] text-white shadow-lg border border-[#008080]/30 transition-all cursor-pointer hover:scale-105 active:scale-95"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}

      {/* 6. Footer */}
      <footer className="w-full border-t border-[var(--color-border)] py-8 px-6 text-center text-xs text-[var(--color-text-muted)] mt-12 bg-[var(--color-surface)]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <BrandLogo linkTo="/" variant="wordmark-only" size="sm" />
          <p>© ۲۰۲۶ آوانا. تمامی حقوق مادی و معنوی برای پلتفرم آموزشی آوانا محفوظ است.</p>
          <div className="flex items-center gap-4 text-xs">
            <Link to="/terms" className="text-[#008080] font-medium hover:underline">
              قوانین و مقررات
            </Link>
            <Link to="/" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              صفحه اصلی
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
