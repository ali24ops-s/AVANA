/**
 * Footer for the AVANA landing page.
 *
 * Light-first, clean editorial finish matching Reference Design:
 * - Brand wordmark with subtle glow
 * - Slogan ("نگاه دارویی ما، راهنمای سلامت شما")
 * - Essential navigation links and social icons
 */

import { Link } from "react-router-dom";
import { BrandLogo } from "../brand/BrandLogo.js";
import { Send, Mail } from "lucide-react";

export function Footer() {
  const footerLinks = [
    { title: "درباره آوانا", href: "/about", isInternalRoute: true },
    { title: "قوانین و مقررات", href: "/terms", isInternalRoute: true },
    { title: "قیمت‌گذاری", href: "/pricing", isInternalRoute: true },
    { title: "پشتیبانی", href: "mailto:support@avana.ir", isInternalRoute: false },
  ];

  return (
    <footer
      className="w-full border-t border-[#E2E7EA] bg-white py-12 px-4 sm:px-6 text-right"
      aria-label="فوتر صفحه اصلی آوانا"
    >
      <div className="max-w-[1280px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand & Slogan */}
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-right">
          <BrandLogo
            linkTo="/"
            variant="wordmark-only"
            size="md"
            className="hover:scale-105 transition-transform duration-300"
          />
          <span className="hidden sm:inline text-[#E2E7EA]">|</span>
          <p className="text-xs text-[#5B6268] font-medium">
            نگاه دارویی ما، راهنمای سلامت شما
          </p>
        </div>

        {/* Navigation Links */}
        <div className="flex flex-wrap justify-center items-center gap-6 text-xs text-[#3d4f55]">
          {footerLinks.map((item) =>
            item.isInternalRoute ? (
              <Link
                key={item.title}
                to={item.href}
                className="hover:text-[#008080] transition-colors duration-200 font-medium"
              >
                {item.title}
              </Link>
            ) : (
              <a
                key={item.title}
                href={item.href}
                className="hover:text-[#008080] transition-colors duration-200 font-medium"
              >
                {item.title}
              </a>
            )
          )}
        </div>

        {/* Social Icons & Contact */}
        <div className="flex items-center gap-4 text-[#5B6268]">
          <a
            href="https://t.me"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="تلگرام آوانا"
            className="w-8 h-8 rounded-lg bg-[#F7F9FA] border border-[#E2E7EA] flex items-center justify-center hover:text-[#008080] hover:border-[#008080]/50 transition-all"
          >
            <Send className="w-4 h-4" />
          </a>
          {/* Instagram SVG */}
          <a
            href="https://instagram.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="اینستاگرام آوانا"
            className="w-8 h-8 rounded-lg bg-[#F7F9FA] border border-[#E2E7EA] flex items-center justify-center hover:text-[#008080] hover:border-[#008080]/50 transition-all"
          >
            <svg
              className="w-4 h-4 fill-none stroke-current stroke-2"
              viewBox="0 0 24 24"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
            </svg>
          </a>
          <a
            href="mailto:info@avana.ir"
            aria-label="ایمیل پشتیبانی"
            className="w-8 h-8 rounded-lg bg-[#F7F9FA] border border-[#E2E7EA] flex items-center justify-center hover:text-[#008080] hover:border-[#008080]/50 transition-all"
          >
            <Mail className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Bottom Copyright line */}
      <div className="max-w-[1280px] mx-auto mt-8 pt-6 border-t border-[#EEF1F3] text-center text-xs text-[#5B6268]">
        © ۲۰۲۶ آوانا. تمامی حقوق برای پلتفرم آموزشی آوانا محفوظ است.
      </div>
    </footer>
  );
}
