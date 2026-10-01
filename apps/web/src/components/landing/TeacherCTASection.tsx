/**
 * Teacher CTA Section for Landing Page.
 *
 * Distinct, light-first card inviting educators to access or register for the Teacher Platform.
 */

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { GraduationCap, ArrowLeft } from "lucide-react";

export function TeacherCTASection() {
  return (
    <section
      id="teacher-cta"
      className="py-8 sm:py-12 px-4 sm:px-6 max-w-[1280px] mx-auto text-right"
      aria-label="بخش ویژه اساتید و مدرسین"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="rounded-3xl bg-teal-50/70 border border-teal-200/80 p-6 sm:p-8 lg:p-10 flex flex-col lg:flex-row items-center justify-between gap-6 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-right gap-4 max-w-2xl">
          <div className="w-12 h-12 rounded-2xl bg-white border border-teal-200 flex items-center justify-center text-[#008080] shrink-0 shadow-xs">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl sm:text-2xl font-bold text-[#1a2226]">
              استاد هستید؟
            </h2>
            <p className="text-sm sm:text-base text-[#3d4f55] leading-relaxed">
              کلاس‌ها و آزمون‌های خود را در AVANA مدیریت کنید.
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto shrink-0">
          <Link
            to="/sign-in?redirect=/teacher"
            className="h-11 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all bg-[#008080] hover:bg-[#007575] active:bg-[#006060] text-white shadow-sm"
          >
            <span>ورود به پنل استاد</span>
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <Link
            to="/sign-up?redirect=/teacher&role=teacher"
            className="h-11 px-6 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all bg-white border border-[#E2E7EA] hover:border-[#008080]/40 text-[#3d4f55] shadow-xs"
          >
            <span>ثبت‌نام استاد</span>
          </Link>
        </div>
      </motion.div>
    </section>
  );
}
