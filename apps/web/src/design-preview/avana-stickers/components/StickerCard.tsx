import React, { useState } from "react";
import { StickerMeta } from "../types.js";

interface StickerCardProps {
  sticker: StickerMeta;
  displaySize?: number;
  bgMode?: "default" | "white" | "dark" | "checker";
}

export const StickerCard: React.FC<StickerCardProps> = ({
  sticker,
  displaySize = 64,
  bgMode = "default",
}) => {
  const [showSizes, setShowSizes] = useState(false);
  const Component = sticker.Component;

  const bgClasses = {
    default: "bg-[var(--color-bg-default,#F7F9FA)]",
    white: "bg-white",
    dark: "bg-[#1A2226] text-white",
    checker:
      "bg-[linear-gradient(45deg,#e5e7eb_25%,transparent_25%),linear-gradient(-45deg,#e5e7eb_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e7eb_75%),linear-gradient(-45deg,transparent_75%,#e5e7eb_75%)] bg-[size:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]",
  }[bgMode];

  return (
    <div className="bg-white rounded-2xl border border-[#E2E7EA] p-4 flex flex-col justify-between shadow-xs hover:shadow-md transition-shadow">
      <div>
        {/* Header / Titles */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#E8F4F4] text-[#006666]">
            {sticker.topicId}
          </span>
          <span className="text-[11px] text-gray-400 font-mono">
            {sticker.conceptId.toUpperCase()}
          </span>
        </div>

        {/* Visual Stage */}
        <div
          className={`h-36 rounded-xl flex items-center justify-center p-4 border border-[#EDF1F3] transition-colors ${bgClasses}`}
        >
          <Component size={displaySize} />
        </div>

        {/* Info */}
        <div className="mt-3.5 space-y-1">
          <h4 className="text-sm font-bold text-[#1A2226]">{sticker.titleFa}</h4>
          <p className="text-xs text-gray-500 font-medium">{sticker.titleEn}</p>
          <p className="text-xs text-gray-600 leading-relaxed mt-1.5">
            {sticker.descriptionFa}
          </p>
        </div>
      </div>

      {/* Footer controls & Real-life Small-size scale */}
      <div className="mt-4 pt-3 border-t border-[#F0F3F5]">
        <button
          type="button"
          onClick={() => setShowSizes(!showSizes)}
          className="text-xs text-[#008080] font-semibold hover:underline flex items-center gap-1"
        >
          {showSizes ? "پنهان کردن اندازه‌های کاربردی" : "بررسی در اندازه‌های واقعی (۲۴px تا ۹۶px)"}
        </button>

        {showSizes && (
          <div className="mt-3 p-2.5 bg-[#F8FAFB] rounded-xl flex items-center justify-around gap-2 border border-[#E9EFF2]">
            <div className="flex flex-col items-center gap-1">
              <Component size={24} />
              <span className="text-[10px] text-gray-400 font-mono">24px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Component size={32} />
              <span className="text-[10px] text-gray-400 font-mono">32px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Component size={48} />
              <span className="text-[10px] text-gray-400 font-mono">48px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Component size={64} />
              <span className="text-[10px] text-gray-400 font-mono">64px</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
