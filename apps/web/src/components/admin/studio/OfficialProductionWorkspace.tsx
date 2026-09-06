import { useState } from "react";
import {
  UploadCloud,
  Layers,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import type { OfficialCourse } from "../../../lib/api/admin.js";
import { OfficialStudioHeader } from "./OfficialStudioHeader.js";
import { SourceProductionPanel } from "./SourceProductionPanel.js";
import { CourseStructurePanel } from "./CourseStructurePanel.js";
import { DraftReviewPanel } from "./DraftReviewPanel.js";
import { PublicationActionCenter } from "./PublicationActionCenter.js";

export type StudioTab = "sources" | "structure" | "review" | "publish";

export interface OfficialProductionWorkspaceProps {
  course: OfficialCourse;
  courses: OfficialCourse[];
  onSelectCourse: (courseId: string) => void;
  onBackToCatalog: () => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function OfficialProductionWorkspace({
  course,
  courses,
  onSelectCourse,
  onBackToCatalog,
  onRefresh,
  isLoading,
}: OfficialProductionWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<StudioTab>("sources");

  // Resolved organization ID (use course.organizationId or fallback)
  const organizationId =
    course.organizationId || "b4a0b464-16db-4087-92b7-163a1e6f6776";

  const handleGenerationComplete = () => {
    // Automatically switch to review tab when generation finishes
    setActiveTab("review");
  };

  const handleApprovalSuccess = () => {
    // Keep user on publish tab to continue with pricing and publication
  };

  return (
    <div className="space-y-6 text-slate-100" dir="rtl">
      {/* Studio Header Bar */}
      <OfficialStudioHeader
        course={course}
        courses={courses}
        onSelectCourse={onSelectCourse}
        onBackToCatalog={onBackToCatalog}
        onRefresh={onRefresh}
        isLoading={isLoading}
      />

      {/* Production Workspace Tabs Navigation */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-x-auto text-xs font-bold shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab("sources")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === "sources"
              ? "bg-teal-600 text-white shadow-md shadow-teal-950/40"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          <span>۱. منابع و تولید هوشمند (Sources & AI)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("review")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === "review"
              ? "bg-teal-600 text-white shadow-md shadow-teal-950/40"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>۲. پیش‌نویس‌ها و بازبینی (Draft Review)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("structure")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === "structure"
              ? "bg-teal-600 text-white shadow-md shadow-teal-950/40"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>۳. ساختار مصوب دوره (Course Structure)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("publish")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all whitespace-nowrap ${
            activeTab === "publish"
              ? "bg-teal-600 text-white shadow-md shadow-teal-950/40"
              : "text-slate-400 hover:text-white hover:bg-slate-800/60"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>۴. تایید، قیمت‌گذاری و انتشار (Publish)</span>
        </button>
      </div>

      {/* Main Tab Panels */}
      <div className="animate-in fade-in">
        {activeTab === "sources" && (
          <SourceProductionPanel
            course={course}
            organizationId={organizationId}
            onGenerationComplete={handleGenerationComplete}
            onNavigateToReview={() => setActiveTab("review")}
          />
        )}

        {activeTab === "review" && (
          <DraftReviewPanel
            courseId={course.id}
            organizationId={organizationId}
            onNavigateToApproval={() => setActiveTab("publish")}
          />
        )}

        {activeTab === "structure" && (
          <CourseStructurePanel courseId={course.id} />
        )}

        {activeTab === "publish" && (
          <PublicationActionCenter
            course={course}
            onSuccess={handleApprovalSuccess}
          />
        )}
      </div>
    </div>
  );
}
