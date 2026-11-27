# مستندات سناریوهای دمو AVANA Pocket

این سند سناریوهای آزمایشی ایجادشده توسط [seed-pocket-demo.ts](file:///Users/ops/Desktop/avana-landing-and-onboarding/scripts/seed-pocket-demo.ts) را برای بررسی دستی قابلیت‌های AVANA Pocket در محیط Local (`avana`) مستند می‌کند.

> [!IMPORTANT]
> تمام محتواهای این مجموعه داده صرفاً آزمایشی هستند و نباید به عنوان توصیه پزشکی یا بالینی واقعی تلقی شوند.

---

## حساب‌های کاربری دمو و اطلاعات ورود

تمام حساب‌ها با مکانیزم استاندارد احراز هویت پروژه (`hashPassword`) و ایمیل تأییدشده ساخته شده‌اند.
رمز عبور مشترک همه حساب‌های دمو: `AvanaDemo#2026`

| ایمیل | نقش / وضعیت حاکمیتی | وضعیت Credential | کاربرد در تست |
| :--- | :--- | :--- | :--- |
| `pocket-demo-admin@avana.demo` | `platform_admin` | — | انتشار Assertion، مدیریت Credentialها و Safety Override |
| `pocket-demo-reviewer-1@avana.demo` | `teacher` (داور بالینی) | فعال (`DEMO-LIC-1001`) | ثبت رای تایید/رد بالینی و ایجاد پیش‌نویس |
| `pocket-demo-reviewer-2@avana.demo` | `teacher` (داور بالینی) | فعال (`DEMO-LIC-1002`) | تایید دوم برای رسیدن به حدنصاب Quorum=2 |
| `pocket-demo-reviewer-3@avana.demo` | `teacher` (داور بالینی) | فعال (`DEMO-LIC-1003`) | ثبت Clinical Conflict |
| `pocket-demo-reviewer-expired@avana.demo` | `teacher` (داور بالینی) | منقضی‌شده (`-30 روز`) | بررسی رد شدن دسترسی داور منقضی |
| `pocket-demo-reviewer-suspended@avana.demo` | `teacher` (داور بالینی) | معلق (`suspendedAt != null`) | بررسی داور تعلیق‌شده |
| `pocket-demo-reviewer-revoked@avana.demo` | `teacher` (داور بالینی) | لغوشده (`isActive = false`) | بررسی داور لغو مجوزشده |
| `pocket-demo-reviewer-postpub@avana.demo` | `teacher` (داور بالینی) | منقضی پس از انتشار (`-5 روز`) | شبیه‌سازی ابطال اعتبار داور بعد از انتشار محتوا |
| `pocket-demo-student@avana.demo` | `user` (`student`) | فاقد مجوز داوری | بررسی نمای مصرف‌کننده عادی در Pocket |

---

## مسیرهای UI برای بررسی سناریوها

* **خانه و جستجوی سریع:** `/pocket` (`PocketHomePage`)
* **کاوشگر و فیلترها (Discovery & Search):** `/pocket/explorer` (`PocketExplorerPage`)
* **صفحه جزئیات موجودیت (مصرف محتوا):** `/pocket/:type/:id` (مثلاً `/pocket/drug/pocket-demo-drug-atorvastatin`)
* **صفحه جزئیات Assertion و داوری:** `/pocket/assertions/:id` (`PocketAssertionDetailPage`)

---

## فهرست سناریوها (۳۷ رکورد / ۳۶ سناریو)

### الف) وضعیت‌های چرخه عمر غیرمنتشرشده (مخفی در نمای مصرف‌کننده)

| شناسه | عنوان فارسی | کلید Assertion | وضعیت DB | علت ایجاد | نتیجه در UI / Search / Consumption |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POCKET-DEMO-001` | پیش‌نویس آتورواستاتین | `pocket-demo-001-draft-atorvastatin` | `draft` | ایجادشده با `createDraftAssertion` | در Search و Consumption نمایش داده **نمی‌شود** (404 در مصرف‌کننده). |
| `POCKET-DEMO-002` | پیش‌نویس صرع کانونی | `pocket-demo-002-draft-epilepsy` | `draft` | پیش‌نویس بیماری بدون ارسال | در Search و Consumption نمایش داده **نمی‌شود**. |
| `POCKET-DEMO-003` | پیش‌نویس مکانیسم پروپرانولول | `pocket-demo-003-draft-propranolol` | `draft` | پیش‌نویس فارماکولوژی | در Search و Consumption نمایش داده **نمی‌شود**. |
| `POCKET-DEMO-004` | دوز آموکسی‌سیلین در انتظار بررسی | `pocket-demo-004-in-review-amox` | `in_review` | انتقال با `submitForReview` | در Search و Consumption نمایش داده **نمی‌شود**. |
| `POCKET-DEMO-005` | بیماری GERD در حال بررسی | `pocket-demo-005-in-review-gerd` | `in_review` | ارسال‌شده برای مرور اولیه | در Search و Consumption نمایش داده **نمی‌شود**. |
| `POCKET-DEMO-006` | تداخل امپرازول در حال بررسی | `pocket-demo-006-in-review-omeprazole` | `in_review` | ارسال‌شده برای مرور اولیه | در Search و Consumption نمایش داده **نمی‌شود**. |
| `POCKET-DEMO-007` | پنومونی تایید اولیه (Reviewed) | `pocket-demo-007-reviewed-cap` | `reviewed` | تایید مرور اولیه، بدون رای بالینی | در Search و Consumption نمایش داده **نمی‌شود**. |
| `POCKET-DEMO-008` | پروتکل فشار خون (Reviewed) | `pocket-demo-008-reviewed-htn-protocol` | `reviewed` | آماده داوری بالینی | در Search و Consumption نمایش داده **نمی‌شود**. |
| `POCKET-DEMO-009` | تنظیم کلیوی متفورمین (Reviewed) | `pocket-demo-009-reviewed-metformin` | `reviewed` | آماده داوری بالینی | در Search و Consumption نمایش داده **نمی‌شود**. |

### ب) سناریوهای Quorum و وضعیت Verified (پیش از انتشار)

| شناسه | عنوان فارسی | کلید Assertion | وضعیت DB | علت ایجاد | نتیجه در UI / Search / Consumption |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POCKET-DEMO-010` | دوز وانکومایسین (۱ تایید کمتر از حدنصاب) | `pocket-demo-010-verified-quorum-short` | `verified` | `dosing` نیازمند ۲ تایید است؛ فقط ۱ رای ثبت شده | منتشر نشده و در مصرف‌کننده **مخفی** است؛ Publishing Gate با `quorum_not_met` مسدود می‌کند. |
| `POCKET-DEMO-011` | دوز لوتیراستام آماده انتشار | `pocket-demo-011-verified-ready` | `verified` | ۲ تایید معتبر دارد ولی هنوز Publish نشده | در مصرف‌کننده **مخفی** است تا ادمین آن را Publish کند. |
| `POCKET-DEMO-012` | اورژانس صرع پایدار (کمبود حدنصاب) | `pocket-demo-012-verified-emergency-short` | `verified` | `emergency` حداقل ۲ تایید می‌خواهد؛ فقط ۱ رای دارد | در مصرف‌کننده **مخفی** است و با `quorum_not_met` مسدود می‌شود. |
| `POCKET-DEMO-035` | منع مصرف متفورمین با اختلاف‌نظر داوران | `pocket-demo-035-reviewed-disagreement` | `verified` | ۱ رای تایید + ۱ رای رد (`active_disagreement`) | از انتشار و نمایش مسدود می‌شود (`active_disagreement`). |
| `POCKET-DEMO-036` | پروتکل فشار خون با رای داور منقضی‌شده | `pocket-demo-036-reviewed-expired-cred-vote` | `verified` | رای ثبت شده اما پروانه داور منقضی شده است | `validApprovalCount = 0` (`all_approvals_invalidated`)؛ غیرقابل انتشار و مخفی. |

### ج) محتوای منتشرشده سالم (قابل مشاهده در UI Search، Discovery و Consumption)

| شناسه | عنوان فارسی | موجودیت هدف (Slug) | نوع / تخصص | نتیجه در UI / Search / Consumption |
| :--- | :--- | :--- | :--- | :--- |
| `POCKET-DEMO-013` | مکانیسم اثر آتورواستاتین | `pocket-demo-drug-atorvastatin` | قلب و عروق (`quorum=1`) | **قابل مشاهده** در Search، Discovery و صفحه دارو. |
| `POCKET-DEMO-014` | دوز آزمایشی آتورواستاتین | `pocket-demo-drug-atorvastatin` | قلب و عروق (`quorum=2`) | **قابل مشاهده** در صفحه آتورواستاتین با ۲ تایید معتبر. |
| `POCKET-DEMO-015` | رژیم آموکسی‌سیلین/کلاوولانات | `pocket-demo-drug-amoxicillin-clavulanate` | بیماری‌های عفونی | **قابل مشاهده** در Search و صفحه دارو. |
| `POCKET-DEMO-016` | معرفی لوتیراستام | `pocket-demo-drug-levetiracetam` | نورولوژی | **قابل مشاهده** در Search و صفحه دارو. |
| `POCKET-DEMO-017` | اطلاعات پایه متفورمین (اعتبار بلندمدت) | `pocket-demo-drug-metformin` | غدد (`+730 روز`) | **قابل مشاهده** با تاریخ اعتبار بلندمدت. |
| `POCKET-DEMO-018` | اطلاعات پایه امپرازول | `pocket-demo-drug-omeprazole` | بیماری‌های داخلی | **قابل مشاهده** (هشدار دیگر آن `027` مسدود است ولی این Assertion قابل مشاهده است). |
| `POCKET-DEMO-019` | پروتکل TDM وانکومایسین | `pocket-demo-drug-vancomycin` | داروسازی بالینی | **قابل مشاهده** در Search و صفحه دارو. |
| `POCKET-DEMO-020` | مکانیسم پروپرانولول | `pocket-demo-drug-propranolol` | فارماکولوژی | **قابل مشاهده** در Search و صفحه دارو. |
| `POCKET-DEMO-021` | پرفشاری خون اولیه | `pocket-demo-disease-hypertension` | قلب و عروق (بیماری) | **قابل مشاهده** به همراه لینک به دارو و پروتکل درمانی. |
| `POCKET-DEMO-022` | تریاژ شوک آنافیلاکسی | `pocket-demo-emergency-anaphylaxis` | اورژانس / ایمنی دارویی | **قابل مشاهده** در تب اورژانس‌های Explorer و صفحه جزئیات. |
| `POCKET-DEMO-023` | پروتکل پایش وانکومایسین | `pocket-demo-treatment-vancomycin-tdm` | داروسازی بالینی (درمان) | **قابل مشاهده** در تب درمان‌ها و صفحه پروتکل. |

### د) تاریخ اعتبار، Safety Override، تعارض بالینی و Post-Publication

| شناسه | عنوان فارسی | کلید Assertion | وضعیت DB | علت ایجاد | نتیجه در UI / Search / Consumption |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `POCKET-DEMO-024` | دیابت نوع ۲ نزدیک به انقضا | `pocket-demo-024-pub-near-expiry` | `published` | `valid_until_date` = ۱۰ روز آینده | **قابل مشاهده** در مصرف‌کننده با تاریخ انقضای نزدیک. |
| `POCKET-DEMO-025` | پنومونی با تاریخ اعتبار منقضی‌شده | `pocket-demo-025-pub-expired-date` | `published` | `valid_until_date` = ۱۵ روز قبل | سابقه `published` در DB حفظ شده؛ تاریخ گذشته در متادیتای Assertion قابل رویت است. |
| `POCKET-DEMO-026` | پروتکل متفورمین نیازمند بازبینی | `pocket-demo-026-pub-needs-reeval` | `published` | `valid_until_date` = ۵ روز آینده | **قابل مشاهده**؛ نشان‌دهنده نیاز به بازبینی دوره‌ای. |
| `POCKET-DEMO-027` | هشدار امپرازول با Safety Override فعال | `pocket-demo-027-pub-override-active` | `published` | `SafetyOverrideService.activateOverride` | در DB `published` است اما به دلیل Override فعال، از Consumption **حذف/مسدود** می‌شود. |
| `POCKET-DEMO-028` | هشدار پروپرانولول با Override رفع‌شده | `pocket-demo-028-pub-override-cleared` | `published` | فعال‌سازی و سپس `clearOverride` | Override غیرفعال است؛ بنابراین مجدداً در Consumption **قابل مشاهده** است. |
| `POCKET-DEMO-029` | پروتکل وارفارین با تاریخچه Override | `pocket-demo-029-pub-override-history` | `published` | تاریخچه ۳ رویداد (`activated -> cleared -> activated`) | از مصرف‌کننده و Search **خارج** شده است؛ تاریخچه در `safety_override_events` محفوظ است. |
| `POCKET-DEMO-030` | اورژانس هیپوگلیسمی با انقضای پس از انتشار | `pocket-demo-030-postpub-cred-expired` | `published` | انتشار با ۲ داور فعال و سپس انقضای پروانه داور دوم | سابقه `published` در DB حفظ شده اما حدنصاب از ۲ به ۱ سقوط کرده؛ در UI مصرف‌کننده **نمایش داده نمی‌شود**. |
| `POCKET-DEMO-031` | تداخل وارفارین با تعارض بالینی فعال | `pocket-demo-031-pub-conflict-active` | `published` | ثبت رکورد در `pocket_clinical_conflicts` | به دلیل `unresolved_clinical_conflict` از Consumption **مسدود** می‌شود. |
| `POCKET-DEMO-032` | دوز وارفارین با ترکیب رای معتبر و نامعتبر | `pocket-demo-032-pub-mixed-votes` | `published` | ۲ رای معتبر فعال + ۱ رای با پروانه منقضی‌شده | چون ۲ رای معتبر حفظ شده، حدنصاب پابرجاست و در UI **قابل مشاهده** است. |
| `POCKET-DEMO-033` | جایگزینی نسخه در صرع کانونی (`v1 -> v2`) | `pocket-demo-033-superseded-chain` | `v1: superseded`, `v2: published` | انتشار نسخه ۲ روی همان `assertion_root_id` | در مصرف‌کننده فقط `v2` نمایش داده می‌شود و `v1` در وضعیت `superseded` بایگانی شده است. |
| `POCKET-DEMO-034` | رکورد بازنشسته‌شده GERD | `pocket-demo-034-retired-historical` | `retired` | وضعیت تاریخی غیرقابل بازگشت | در مصرف‌کننده و Search نمایش داده **نمی‌شود**. |

---

## دستورات اجرا و پاکسازی

```bash
# اجرای Seed (ایمن و Idempotent روی دیتابیس avana در 127.0.0.1:5432)
npx tsx scripts/seed-pocket-demo.ts

# پاکسازی کامل و هدفمند فقط داده‌های همین Seed
npx tsx scripts/seed-pocket-demo.ts --cleanup
```
