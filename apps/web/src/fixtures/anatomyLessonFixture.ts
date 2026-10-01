import type { CourseLearnResponse } from "@avana/contracts";

export const ANATOMY_HEART_COURSE_ID = "anatomy-heart";
export const ANATOMY_HEART_LESSON_ID = "lesson-heart-anatomy";

export const ANATOMY_HEART_MARKDOWN = `# آناتومی قلب — ساختمان و مسیر جریان خون

**ساختمان حفره‌ها، دریچه‌ها و مسیر عبور خون در قلب**

قلب یک اندام عضلانی است که با ایجاد فشار، خون را در گردش ریوی و سیستمیک به حرکت درمی‌آورد. ساختمان قلب شامل چهار حفره، چهار دریچه اصلی و عروق بزرگی است که ورود و خروج خون را تنظیم می‌کنند.

---

\`\`\`anatomy
{
  "figure": "heart-anterior-cut",
  "title": "آناتومی قلب"
}
\`\`\`

---

## ساختارهای مهم قلب

شناخت دقیق حفرات و نحوه ارتباط آن‌ها با گردش خون، پایه یادگیری فیزیولوژی قلبی‌عروقی است:

* **دهلیز راست (Right Atrium):** خون کم‌اکسیژن را از وریدهای اجوف فوقانی و تحتانی دریافت می‌کند و به بطن راست می‌فرستد.
* **بطن راست (Right Ventricle):** خون کم‌اکسیژن را از طریق شریان ریوی به سمت ریه‌ها هدایت می‌کند تا اکسیژن‌گیری انجام شود.
* **دهلیز چپ (Left Atrium):** خون تازه و اکسیژن‌دار را از چهار ورید ریوی تحویل گرفته و وارد بطن چپ می‌کند.
* **بطن چپ (Left Ventricle):** با داشتن ضخیم‌ترین دیواره میوکارد، خون اکسیژن‌دار را با فشار بالا از طریق آئورت وارد گردش سیستمیک سراسر بدن می‌کند.

---

## مسیر جریان خون در قلب

برای درک عملکرد پیوسته قلب، مسیر عبور گلبول‌های قرمز را به صورت گام‌به‌گام در دیاگرام زیر مرور کنید:

\`\`\`bloodflow
{}
\`\`\`

---

> برای فهم بهتر
> سمت راست قلب عمدتاً با گردش ریوی و سمت چپ قلب با گردش سیستمیک ارتباط دارد. دریچه‌ها با جلوگیری از برگشت خون، جهت یک‌طرفه جریان را حفظ می‌کنند.
`;

export const ANATOMY_HEART_FIXTURE: CourseLearnResponse = {
  request_id: "req-anatomy-heart-poc",
  course: {
    id: ANATOMY_HEART_COURSE_ID,
    title: "آناتومی قلب — ساختمان و مسیر جریان خون",
    subject: "آناتومی و فیزیولوژی قلب",
    exam_at: null,
    is_official: true,
  },
  modules: [
    {
      id: "mod-circulatory-system",
      title: "دستگاه گردش خون و قلب",
      description: "بررسی ساختار حفرات و مسیرهای ارتباطی قلب",
      sort_order: 1,
      lessons: [
        {
          id: ANATOMY_HEART_LESSON_ID,
          module_id: "mod-circulatory-system",
          title: "آناتومی قلب — ساختمان و مسیر جریان خون",
          content_type: "markdown",
          sort_order: 1,
          estimated_minutes: 15,
          is_preview: true,
          content_markdown: ANATOMY_HEART_MARKDOWN,
          completed: false,
          completed_at: null,
        },
      ],
    },
  ],
  progress: {
    total_lessons: 1,
    completed_lessons: 0,
    progress_percent: 0,
  },
};
