import React, { useEffect } from "react";
import { AboutNavbar } from "../components/about/AboutNavbar.js";
import { AboutHeroSection } from "../components/about/AboutHeroSection.js";
import { AboutProblemSection } from "../components/about/AboutProblemSection.js";
import { AboutPhilosophySection } from "../components/about/AboutPhilosophySection.js";
import { AboutEcosystemSection } from "../components/about/AboutEcosystemSection.js";
import { AboutFutureStorySection } from "../components/about/AboutFutureStorySection.js";
import { AboutHumanMessageSection } from "../components/about/AboutHumanMessageSection.js";
import { AboutFinalCTASection } from "../components/about/AboutFinalCTASection.js";
import { Footer } from "../components/landing/Footer.js";

export const AboutPage: React.FC = () => {
  useEffect(() => {
    // Set SEO title & meta description
    document.title = "درباره آوانا | یادگیری هوشمند برای دانشجویان داروسازی";

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute(
      "content",
      "آوانا برای کمک به دانشجویان داروسازی ساخته شده است؛ از تبدیل حجم زیاد اطلاعات به یادگیری ساختاریافته تا مرور هوشمند و ساخت مسیر شخصی مطالعه."
    );

    // Scroll to top on load
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-page min-h-screen relative font-body bg-[#0b1120] text-slate-100 selection:bg-teal-500/30 selection:text-teal-200">
      {/* Unified Navigation with Scroll Progress */}
      <AboutNavbar />

      {/* Main Narrative Container (7 Sequential Story Sections) */}
      <main className="relative z-10 pt-20">
        {/* Section 1: Hero Experience (Chaos -> Understanding Text Reveal & Dynamic Particles) */}
        <AboutHeroSection />

        {/* Section 2: The Real Problem (Overload to Organized Taxonomy) */}
        <AboutProblemSection />

        {/* Section 3: AVANA Philosophy (4 Conceptual Micro-Experiences) */}
        <AboutPhilosophySection />

        {/* Section 4: How AVANA Thinks (Interactive Neural Ecosystem & Interconnected Nodes) */}
        <AboutEcosystemSection />

        {/* Section 5: The Future Story (Student -> Understanding -> Mastery Track) */}
        <AboutFutureStorySection />

        {/* Section 6: The Human Message (Empathetic Breathing Space for Students) */}
        <AboutHumanMessageSection />

        {/* Section 7: Final CTA & Crystalline Resolution */}
        <AboutFinalCTASection />
      </main>

      {/* Shared Footer */}
      <Footer />
    </div>
  );
};
