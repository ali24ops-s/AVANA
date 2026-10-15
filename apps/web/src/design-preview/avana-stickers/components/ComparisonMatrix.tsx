import React from "react";
import { STICKER_TOPICS, getSticker } from "../registry.js";

interface ComparisonMatrixProps {
  displaySize: number;
  bgMode: "default" | "white" | "dark" | "checker";
}

export const ComparisonMatrix: React.FC<ComparisonMatrixProps> = ({
  displaySize,
  bgMode,
}) => {
  const bgClasses = {
    default: "bg-[#F7F9FA]",
    white: "bg-white",
    dark: "bg-[#1A2226] text-white",
    checker:
      "bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]",
  }[bgMode];

  return (
    <div className="space-y-6">
      {/* Table Column Headers */}
      <div className="hidden lg:grid grid-cols-12 gap-4 sticky top-20 z-10 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-[#E2E7EA] shadow-xs">
        <div className="col-span-3 text-right">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
            موضوع استیکر (۶ موقعیت یکسان)
          </span>
        </div>
        <div className="col-span-3 text-center border-r border-gray-100 pr-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E0F2F2] text-[#006666] font-extrabold text-sm">
            <span>کانسپت A: Minimal Vector</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">وکتور دوبعدی، هندسه تمیز و علمی</p>
        </div>
        <div className="col-span-3 text-center border-r border-gray-100 pr-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#E8F4FB] text-[#2B6D8F] font-extrabold text-sm">
            <span>کانسپت B: Soft 3D</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">حجم ارگانیک، بافت مات و سایه ملایم</p>
        </div>
        <div className="col-span-3 text-center border-r border-gray-100 pr-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FDF2E4] text-[#8F5E27] font-extrabold text-sm">
            <span>کانسپت C: Avani Character</span>
          </div>
          <p className="text-[11px] text-gray-500 mt-1">کاراکتر اختصاصی، هویت برند آوانا</p>
        </div>
      </div>

      {/* 6 Comparative Rows */}
      <div className="space-y-6">
        {STICKER_TOPICS.map((topic, index) => {
          const stickerA = getSticker("concept-a", topic.id);
          const stickerB = getSticker("concept-b", topic.id);
          const stickerC = getSticker("concept-c", topic.id);

          return (
            <div
              key={topic.id}
              className="bg-white rounded-2xl border border-[#E2E7EA] p-5 shadow-xs hover:border-[#008080]/30 transition-all"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
                {/* Topic Metadata Column */}
                <div className="lg:col-span-3 space-y-1.5 border-b lg:border-b-0 lg:border-l border-gray-100 pb-4 lg:pb-0 lg:pl-4">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-[#008080] text-white flex items-center justify-center text-xs font-bold">
                      {index + 1}
                    </span>
                    <h3 className="text-base font-extrabold text-[#1A2226]">
                      {topic.titleFa}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-400 font-mono font-medium">
                    {topic.titleEn}
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    {topic.descriptionFa}
                  </p>
                  <div className="pt-2">
                    <span className="inline-block text-[11px] font-medium text-[#006666] bg-[#F0FAFA] px-2.5 py-1 rounded-lg border border-[#B3D9D9]">
                      کاربرد: {topic.contextUsageFa}
                    </span>
                  </div>
                </div>

                {/* Concept A Cell */}
                <div className="lg:col-span-3 flex flex-col items-center">
                  <div className="lg:hidden text-xs font-bold text-[#008080] mb-2">
                    کانسپت A: Minimal Vector
                  </div>
                  <div
                    className={`w-full h-36 rounded-xl flex items-center justify-center border border-[#EDF1F3] transition-colors p-3 ${bgClasses}`}
                  >
                    {stickerA && <stickerA.Component size={displaySize} />}
                  </div>
                  <div className="mt-2 text-center">
                    <span className="text-xs font-bold text-[#1A2226]">
                      {stickerA?.titleFa}
                    </span>
                    <div className="flex items-center justify-center gap-2 mt-1.5">
                      <span className="text-[10px] text-gray-500 font-medium">اندازه واقعی در UI:</span>
                      {stickerA && <stickerA.Component size={24} />}
                      {stickerA && <stickerA.Component size={32} />}
                    </div>
                  </div>
                </div>

                {/* Concept B Cell */}
                <div className="lg:col-span-3 flex flex-col items-center">
                  <div className="lg:hidden text-xs font-bold text-[#2B6D8F] mb-2">
                    کانسپت B: Soft 3D
                  </div>
                  <div
                    className={`w-full h-36 rounded-xl flex items-center justify-center border border-[#EDF1F3] transition-colors p-3 ${bgClasses}`}
                  >
                    {stickerB && <stickerB.Component size={displaySize} />}
                  </div>
                  <div className="mt-2 text-center">
                    <span className="text-xs font-bold text-[#1A2226]">
                      {stickerB?.titleFa}
                    </span>
                    <div className="flex items-center justify-center gap-2 mt-1.5">
                      <span className="text-[10px] text-gray-500 font-medium">اندازه واقعی در UI:</span>
                      {stickerB && <stickerB.Component size={24} />}
                      {stickerB && <stickerB.Component size={32} />}
                    </div>
                  </div>
                </div>

                {/* Concept C Cell */}
                <div className="lg:col-span-3 flex flex-col items-center">
                  <div className="lg:hidden text-xs font-bold text-[#8F5E27] mb-2">
                    کانسپت C: Avani Character
                  </div>
                  <div
                    className={`w-full h-36 rounded-xl flex items-center justify-center border border-[#EDF1F3] transition-colors p-3 ${bgClasses}`}
                  >
                    {stickerC && <stickerC.Component size={displaySize} />}
                  </div>
                  <div className="mt-2 text-center">
                    <span className="text-xs font-bold text-[#1A2226]">
                      {stickerC?.titleFa}
                    </span>
                    <div className="flex items-center justify-center gap-2 mt-1.5">
                      <span className="text-[10px] text-gray-500 font-medium">اندازه واقعی در UI:</span>
                      {stickerC && <stickerC.Component size={24} />}
                      {stickerC && <stickerC.Component size={32} />}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
