import React, { useState, useId } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Info } from "lucide-react";

export interface AnatomicalStructure {
  id: string;
  persianName: string;
  englishName: string;
  side: "right" | "left" | "central";
  type: "chamber" | "valve" | "vessel";
  role: string;
  targetPoint: { x: number; y: number };
  labelPoint: { x: number; y: number };
  leaderLine: { x1: number; y1: number; x2: number; y2: number; x3?: number; y3?: number };
}

export const HEART_STRUCTURES: AnatomicalStructure[] = [
  // Right side (Viewer's Left - Anatomical Right)
  {
    id: "superior-vena-cava",
    persianName: "ورید اجوف فوقانی",
    englishName: "Superior Vena Cava",
    side: "right",
    type: "vessel",
    role: "انتقال خون کم‌اکسیژن از سر، گردن و اندام‌های فوقانی به دهلیز راست",
    targetPoint: { x: 345, y: 110 },
    labelPoint: { x: 175, y: 95 },
    leaderLine: { x1: 345, y1: 110, x2: 245, y2: 95, x3: 175, y3: 95 },
  },
  {
    id: "pulmonary-artery",
    persianName: "شریان ریوی",
    englishName: "Pulmonary Trunk & Arteries",
    side: "central",
    type: "vessel",
    role: "انتقال خون کم‌اکسیژن از بطن راست به شش‌ها جهت تبادل گازهای تنفسی",
    targetPoint: { x: 420, y: 195 },
    labelPoint: { x: 175, y: 180 },
    leaderLine: { x1: 420, y1: 195, x2: 245, y2: 180, x3: 175, y3: 180 },
  },
  {
    id: "right-atrium",
    persianName: "دهلیز راست",
    englishName: "Right Atrium",
    side: "right",
    type: "chamber",
    role: "دریافت خون کم‌اکسیژن از وریدهای اجوف و هدایت آن از طریق دریچه تریکوسپید به بطن راست",
    targetPoint: { x: 330, y: 290 },
    labelPoint: { x: 175, y: 265 },
    leaderLine: { x1: 330, y1: 290, x2: 245, y2: 265, x3: 175, y3: 265 },
  },
  {
    id: "tricuspid-valve",
    persianName: "دریچه تریکوسپید",
    englishName: "Tricuspid Valve",
    side: "right",
    type: "valve",
    role: "دریچه سه‌لتی دهلیزی‌بطنی راست؛ جلوگیری از بازگشت خون به دهلیز هنگام سیستول بطنی",
    targetPoint: { x: 370, y: 375 },
    labelPoint: { x: 175, y: 350 },
    leaderLine: { x1: 370, y1: 375, x2: 245, y2: 350, x3: 175, y3: 350 },
  },
  {
    id: "right-ventricle",
    persianName: "بطن راست",
    englishName: "Right Ventricle",
    side: "right",
    type: "chamber",
    role: "پمپاژ خون کم‌اکسیژن به درون تنه شریان ریوی به سمت گردش کم‌فشار ریوی",
    targetPoint: { x: 380, y: 465 },
    labelPoint: { x: 175, y: 435 },
    leaderLine: { x1: 380, y1: 465, x2: 245, y2: 435, x3: 175, y3: 435 },
  },
  {
    id: "inferior-vena-cava",
    persianName: "ورید اجوف تحتانی",
    englishName: "Inferior Vena Cava",
    side: "right",
    type: "vessel",
    role: "انتقال خون کم‌اکسیژن از تنه، احشا و اندام‌های تحتانی به دهلیز راست",
    targetPoint: { x: 350, y: 545 },
    labelPoint: { x: 175, y: 520 },
    leaderLine: { x1: 350, y1: 545, x2: 245, y2: 520, x3: 175, y3: 520 },
  },

  // Left side (Viewer's Right - Anatomical Left)
  {
    id: "aorta",
    persianName: "آئورت",
    englishName: "Aorta",
    side: "central",
    type: "vessel",
    role: "شریان اصلی بدن؛ دریافت خون اکسیژن‌دار از بطن چپ و توزیع آن در گردش سیستمیک",
    targetPoint: { x: 470, y: 95 },
    labelPoint: { x: 725, y: 95 },
    leaderLine: { x1: 470, y1: 95, x2: 655, y2: 95, x3: 725, y3: 95 },
  },
  {
    id: "pulmonary-veins",
    persianName: "وریدهای ریوی",
    englishName: "Pulmonary Veins",
    side: "left",
    type: "vessel",
    role: "چهار رگ آورنده خون پر از اکسیژن از ریه‌ها به سمت دهلیز چپ",
    targetPoint: { x: 590, y: 245 },
    labelPoint: { x: 725, y: 180 },
    leaderLine: { x1: 590, y1: 245, x2: 655, y2: 180, x3: 725, y3: 180 },
  },
  {
    id: "left-atrium",
    persianName: "دهلیز چپ",
    englishName: "Left Atrium",
    side: "left",
    type: "chamber",
    role: "دریافت خون پراکسیژن از وریدهای ریوی و انتقال آن از دریچه میترال به بطن چپ",
    targetPoint: { x: 535, y: 290 },
    labelPoint: { x: 725, y: 265 },
    leaderLine: { x1: 535, y1: 290, x2: 655, y2: 265, x3: 725, y3: 265 },
  },
  {
    id: "mitral-valve",
    persianName: "دریچه میترال",
    englishName: "Mitral Valve",
    side: "left",
    type: "valve",
    role: "دریچه دولتی (بیکوسپید) دهلیزی‌بطنی چپ؛ هدایت یک‌طرفه خون به بطن چپ با تکیه بر طناب‌های وتری",
    targetPoint: { x: 515, y: 380 },
    labelPoint: { x: 725, y: 350 },
    leaderLine: { x1: 515, y1: 380, x2: 655, y2: 350, x3: 725, y3: 350 },
  },
  {
    id: "left-ventricle",
    persianName: "بطن چپ",
    englishName: "Left Ventricle",
    side: "left",
    type: "chamber",
    role: "دارای ضخیم‌ترین دیواره عضلانی میوکارد؛ پمپاژ پرفشار خون اکسیژن‌دار به درون آئورت",
    targetPoint: { x: 510, y: 480 },
    labelPoint: { x: 725, y: 435 },
    leaderLine: { x1: 510, y1: 480, x2: 655, y2: 435, x3: 725, y3: 435 },
  },
];

export interface HeartAnatomyDiagramProps {
  className?: string;
  initialSelectedId?: string | null;
  onStructureSelect?: (structure: AnatomicalStructure | null) => void;
}

export function HeartAnatomyDiagram({
  className = "",
  initialSelectedId = null,
  onStructureSelect,
}: HeartAnatomyDiagramProps) {
  const [activeId, setActiveId] = useState<string | null>(initialSelectedId);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const filterId = useId().replace(/:/g, "_");

  const handleSelect = (s: AnatomicalStructure | null) => {
    const nextId = s ? (activeId === s.id ? null : s.id) : null;
    setActiveId(nextId);
    if (onStructureSelect) {
      onStructureSelect(nextId ? s : null);
    }
  };

  const activeStructure = HEART_STRUCTURES.find((s) => s.id === activeId);

  const zoomIn = () => setZoomLevel((z) => Math.min(1.5, z + 0.15));
  const zoomOut = () => setZoomLevel((z) => Math.max(0.85, z - 0.15));
  const resetZoom = () => setZoomLevel(1);

  return (
    <div
      className={`my-6 sm:my-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-7 shadow-xs transition-colors ${className}`}
      dir="rtl"
    >
      {/* Top Header & Context Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--color-border)]">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] tracking-tight">
            مقطع تاجی قدامی قلب (Coronal Section)
          </h3>
          <p className="text-xs sm:text-[13px] text-[var(--color-text-muted)] mt-1">
            نگاره تشریحی علمی ساختمان حفرات، دریچه‌ها، میوکارد و عروق بزرگ
          </p>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0 bg-[var(--color-surface-warm)] p-1 rounded-xl border border-[var(--color-border)]">
          <button
            type="button"
            onClick={zoomIn}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
            title="بزرگ‌نمایی"
            aria-label="بزرگ‌نمایی"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-[11px] font-mono font-medium px-1 text-[var(--color-text-muted)] select-none">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            type="button"
            onClick={zoomOut}
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
            title="کوچک‌نمایی"
            aria-label="کوچک‌نمایی"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          {zoomLevel !== 1 && (
            <button
              type="button"
              onClick={resetZoom}
              className="p-1.5 rounded-lg text-teal-600 dark:text-teal-400 hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
              title="اندازه پیش‌فرض"
              aria-label="اندازه پیش‌فرض"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Medical Textbook Plate Canvas */}
      <div className="relative w-full overflow-x-auto py-2 sm:py-4 select-none touch-pan-x scrollbar-thin">
        <div className="sm:hidden text-center text-[10px] text-slate-400 mb-1">
          برای مشاهده دقیق‌تر، می‌توانید تصویر را به چپ یا راست بکشید
        </div>
        <div
          className="transition-transform duration-200 origin-center flex justify-center"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          <svg
            viewBox="0 0 900 660"
            className="w-full h-auto min-w-[560px] sm:min-w-0 max-w-[860px] max-h-[580px]"
            role="img"
            aria-label="نگاره تشریحی مقطع قدامی قلب انسان"
          >
            <defs>
              {/* Textbook Subtle Shading & Plate Shadow */}
              <filter id={`plate-shadow-${filterId}`} x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.10" />
              </filter>
              <filter id={`lumen-depth-${filterId}`} x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>

              {/* Fine Anatomic Muscle Texture Pattern */}
              <pattern id={`muscle-hatch-${filterId}`} width="6" height="6" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                <line x1="0" y1="0" x2="0" y2="6" stroke="#4A101A" strokeWidth="0.75" opacity="0.35" />
              </pattern>

              {/* Realistic Medical Textbook Gradients */}
              {/* 1. Deoxygenated Blood System (Venous Steel Blue) */}
              <linearGradient id={`grad-venous-${filterId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#416788" />
                <stop offset="50%" stopColor="#2D4A6B" />
                <stop offset="100%" stopColor="#1B334D" />
              </linearGradient>

              {/* 2. Oxygenated Blood System (Arterial Deep Crimson/Rose) */}
              <linearGradient id={`grad-arterial-${filterId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#C44550" />
                <stop offset="50%" stopColor="#9E2A34" />
                <stop offset="100%" stopColor="#6E1820" />
              </linearGradient>

              {/* 3. Myocardium Muscle Cut Surface (Textbook Brick Red / Dark Carmine) */}
              <linearGradient id={`grad-myocardium-${filterId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#8C2433" />
                <stop offset="40%" stopColor="#751A27" />
                <stop offset="100%" stopColor="#54101A" />
              </linearGradient>

              {/* 4. Interventricular Septum (Muscular Septum) */}
              <linearGradient id={`grad-septum-${filterId}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#5E1522" />
                <stop offset="50%" stopColor="#7D1E2D" />
                <stop offset="100%" stopColor="#5E1522" />
              </linearGradient>

              {/* 5. Aorta Arch (Great Vessel Deep Terracotta) */}
              <linearGradient id={`grad-aorta-arch-${filterId}`} x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#B3333F" />
                <stop offset="40%" stopColor="#9C2631" />
                <stop offset="100%" stopColor="#7B1A22" />
              </linearGradient>

              {/* 6. Pulmonary Trunk */}
              <linearGradient id={`grad-pulm-trunk-${filterId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4A7299" />
                <stop offset="50%" stopColor="#33567A" />
                <stop offset="100%" stopColor="#213E5C" />
              </linearGradient>

              {/* 7. Fibrous Skeleton & Valve Cusps (Pearl Ivory) */}
              <linearGradient id={`grad-valve-cusp-${filterId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#F7F3EC" />
                <stop offset="60%" stopColor="#E5DCcf" />
                <stop offset="100%" stopColor="#C4B7A5" />
              </linearGradient>

              {/* 8. Epicardial Adipose Tissue (Coronary Sulcus Fat - Natural Pale Ochre) */}
              <linearGradient id={`grad-fat-${filterId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#EADBB5" />
                <stop offset="100%" stopColor="#CFBE8F" />
              </linearGradient>
            </defs>

            {/* ------------------------------------------------------------- */}
            {/* BASE ANATOMICAL PLATE: MYOCARDIAL CROSS-SECTION & CAVITIES   */}
            {/* ------------------------------------------------------------- */}

            {/* 1. POSTERIOR PERICARDIUM & MYOCARDIAL SILHOUETTE */}
            <g id="plate-myocardium-silhouette" filter={`url(#plate-shadow-${filterId})`}>
              {/* Outer boundary of cardiac ventricles & apex */}
              <path
                d="M 465 170
                   C 365 160, 275 230, 275 340
                   C 275 425, 320 505, 385 565
                   C 425 600, 460 625, 475 625
                   C 490 625, 525 585, 570 535
                   C 630 465, 638 385, 638 320
                   C 638 215, 555 160, 465 170 Z"
                fill={`url(#grad-myocardium-${filterId})`}
                stroke="#3D0C13"
                strokeWidth="2.5"
              />
              {/* Myocardial muscle fiber cross-hatch texture */}
              <path
                d="M 465 170
                   C 365 160, 275 230, 275 340
                   C 275 425, 320 505, 385 565
                   C 425 600, 460 625, 475 625
                   C 490 625, 525 585, 570 535
                   C 630 465, 638 385, 638 320
                   C 638 215, 555 160, 465 170 Z"
                fill={`url(#muscle-hatch-${filterId})`}
                opacity="0.45"
              />
            </g>

            {/* 2. SUPERIOR VENA CAVA (SVC) */}
            <g
              id="structure-superior-vena-cava"
              className="cursor-pointer transition-opacity"
              opacity={!activeId || activeId === "superior-vena-cava" ? 1 : 0.35}
              onClick={() => handleSelect(HEART_STRUCTURES[0])}
            >
              {/* SVC Vessel Tube */}
              <path
                d="M 325 55
                   C 325 55, 323 125, 320 185
                   C 320 205, 355 210, 365 195
                   C 365 145, 368 55, 368 55 Z"
                fill={`url(#grad-venous-${filterId})`}
                stroke="#1B334D"
                strokeWidth="2"
              />
              {/* Cut Lumen of SVC with thickness rim */}
              <ellipse cx="346" cy="55" rx="21" ry="8" fill="#244260" stroke="#162B42" strokeWidth="1.75" />
              <ellipse cx="346" cy="55" rx="16" ry="5.5" fill="#14263B" stroke="#0E1E2E" strokeWidth="1" />
              {/* Subtle lumen flow highlight line */}
              <path d="M 346 65 L 346 170" stroke="#5B86B0" strokeWidth="1.5" strokeDasharray="3,3" opacity="0.5" />
            </g>

            {/* 3. INFERIOR VENA CAVA (IVC) */}
            <g
              id="structure-inferior-vena-cava"
              className="cursor-pointer transition-opacity"
              opacity={!activeId || activeId === "inferior-vena-cava" ? 1 : 0.35}
              onClick={() => handleSelect(HEART_STRUCTURES[5])}
            >
              <path
                d="M 330 495
                   C 330 520, 332 580, 332 595
                   C 332 605, 372 605, 372 595
                   C 372 575, 370 515, 370 495 Z"
                fill={`url(#grad-venous-${filterId})`}
                stroke="#1B334D"
                strokeWidth="2"
              />
              {/* Cut Lumen of IVC */}
              <ellipse cx="351" cy="595" rx="20" ry="7.5" fill="#244260" stroke="#162B42" strokeWidth="1.75" />
              <ellipse cx="351" cy="595" rx="15" ry="5" fill="#14263B" stroke="#0E1E2E" strokeWidth="1" />
            </g>

            {/* 4. AORTIC ARCH & BRANCHES */}
            <g
              id="structure-aorta"
              className="cursor-pointer transition-opacity"
              opacity={!activeId || activeId === "aorta" ? 1 : 0.35}
              onClick={() => handleSelect(HEART_STRUCTURES[6])}
            >
              {/* Descending Aorta (posterior) */}
              <path
                d="M 535 150 C 540 180, 545 220, 545 260 L 515 260 C 515 220, 510 180, 505 150 Z"
                fill="#61141A"
                stroke="#420D12"
                strokeWidth="1.5"
                opacity="0.8"
              />

              {/* Main Ascending Aorta & Arch */}
              <path
                d="M 458 245
                   C 455 170, 420 85, 475 62
                   C 530 40, 575 88, 568 180
                   L 528 185
                   C 533 125, 505 92, 478 102
                   C 458 110, 432 150, 432 245 Z"
                fill={`url(#grad-aorta-arch-${filterId})`}
                stroke="#541017"
                strokeWidth="2.5"
              />

              {/* 3 Supra-Aortic Branches (Textbook anatomical branch vessels) */}
              {/* 1. Brachiocephalic trunk (Truncus brachiocephalicus) */}
              <path d="M 462 76 L 452 28 L 472 28 L 478 70 Z" fill={`url(#grad-aorta-arch-${filterId})`} stroke="#541017" strokeWidth="1.75" />
              <ellipse cx="462" cy="28" rx="10" ry="3.5" fill="#6B1820" stroke="#420D12" strokeWidth="1" />

              {/* 2. Left common carotid (A. carotis communis sinistra) */}
              <path d="M 494 62 L 498 25 L 516 25 L 510 60 Z" fill={`url(#grad-aorta-arch-${filterId})`} stroke="#541017" strokeWidth="1.75" />
              <ellipse cx="507" cy="25" rx="9" ry="3.5" fill="#6B1820" stroke="#420D12" strokeWidth="1" />

              {/* 3. Left subclavian artery (A. subclavia sinistra) */}
              <path d="M 528 66 L 538 32 L 555 35 L 544 72 Z" fill={`url(#grad-aorta-arch-${filterId})`} stroke="#541017" strokeWidth="1.75" />
              <ellipse cx="546" cy="33" rx="8.5" ry="3.5" fill="#6B1820" stroke="#420D12" strokeWidth="1" />

              {/* Aortic Semilunar Valve Root (in coronal cross-section) */}
              <path
                d="M 436 242 C 445 252, 455 252, 464 242"
                fill="none"
                stroke={`url(#grad-valve-cusp-${filterId})`}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </g>

            {/* 5. PULMONARY TRUNK & BIFURCATION */}
            <g
              id="structure-pulmonary-artery"
              className="cursor-pointer transition-opacity"
              opacity={!activeId || activeId === "pulmonary-artery" ? 1 : 0.35}
              onClick={() => handleSelect(HEART_STRUCTURES[1])}
            >
              {/* Right Pulmonary Artery (passing under Aorta arch) */}
              <path
                d="M 420 200 C 375 188, 330 190, 290 205 L 295 228 C 330 215, 370 215, 405 224 Z"
                fill={`url(#grad-pulm-trunk-${filterId})`}
                stroke="#1B334D"
                strokeWidth="2"
              />
              <ellipse cx="292" cy="216" rx="6" ry="11.5" fill="#244260" stroke="#162B42" strokeWidth="1.25" />

              {/* Left Pulmonary Artery branch */}
              <path
                d="M 460 165 C 495 160, 555 165, 595 175 L 590 198 C 555 188, 502 184, 470 186 Z"
                fill={`url(#grad-pulm-trunk-${filterId})`}
                stroke="#1B334D"
                strokeWidth="2"
              />
              <ellipse cx="592" cy="186" rx="6" ry="11.5" fill="#244260" stroke="#162B42" strokeWidth="1.25" />

              {/* Main Pulmonary Trunk Base (arising from Conus Arteriosus) */}
              <path
                d="M 405 265
                   C 402 205, 428 172, 462 165
                   L 472 188
                   C 445 192, 428 214, 428 265 Z"
                fill={`url(#grad-pulm-trunk-${filterId})`}
                stroke="#1B334D"
                strokeWidth="2.5"
              />

              {/* Pulmonary Semilunar Valve */}
              <path
                d="M 407 263 C 416 270, 426 270, 432 263"
                fill="none"
                stroke={`url(#grad-valve-cusp-${filterId})`}
                strokeWidth="3.5"
                strokeLinecap="round"
              />
            </g>

            {/* 6. PULMONARY VEINS (Vv. pulmonales entering Left Atrium) */}
            <g
              id="structure-pulmonary-veins"
              className="cursor-pointer transition-opacity"
              opacity={!activeId || activeId === "pulmonary-veins" ? 1 : 0.35}
              onClick={() => handleSelect(HEART_STRUCTURES[7])}
            >
              {/* Left superior & inferior pulmonary veins */}
              <path d="M 575 232 L 632 232 L 632 254 L 575 254 Z" fill="#992631" stroke="#5E141B" strokeWidth="1.75" />
              <path d="M 575 262 L 632 262 L 632 284 L 575 284 Z" fill="#992631" stroke="#5E141B" strokeWidth="1.75" />
              <ellipse cx="632" cy="243" rx="5.5" ry="11" fill="#751A22" stroke="#470E14" strokeWidth="1.25" />
              <ellipse cx="632" cy="273" rx="5.5" ry="11" fill="#751A22" stroke="#470E14" strokeWidth="1.25" />
            </g>

            {/* 7. RIGHT ATRIUM INTERNAL CAVITY (Atrium dextrum) */}
            <g
              id="structure-right-atrium"
              className="cursor-pointer transition-opacity"
              opacity={!activeId || activeId === "right-atrium" ? 1 : 0.35}
              onClick={() => handleSelect(HEART_STRUCTURES[2])}
            >
              {/* Chamber Lumen */}
              <path
                d="M 320 205
                   C 285 235, 285 335, 312 360
                   C 336 380, 372 375, 386 360
                   C 386 295, 376 225, 348 205 Z"
                fill={`url(#grad-venous-${filterId})`}
                stroke="#1B334D"
                strokeWidth="2"
              />
              {/* Fine Anatomic Pectinate Muscle Ridges (Musculi pectinati) */}
              <path d="M 292 260 C 308 266, 314 280, 310 295" stroke="#6086AC" strokeWidth="1.75" fill="none" opacity="0.65" strokeLinecap="round" />
              <path d="M 290 305 C 304 310, 310 326, 305 340" stroke="#6086AC" strokeWidth="1.75" fill="none" opacity="0.65" strokeLinecap="round" />
              <path d="M 295 342 C 308 348, 315 358, 312 365" stroke="#6086AC" strokeWidth="1.5" fill="none" opacity="0.6" strokeLinecap="round" />
              {/* Fossa Ovalis on interatrial septum */}
              <ellipse cx="360" cy="290" rx="9" ry="14" fill="#203A54" stroke="#4F7499" strokeWidth="1.5" opacity="0.75" />
            </g>

            {/* 8. LEFT ATRIUM INTERNAL CAVITY (Atrium sinistrum) */}
            <g
              id="structure-left-atrium"
              className="cursor-pointer transition-opacity"
              opacity={!activeId || activeId === "left-atrium" ? 1 : 0.35}
              onClick={() => handleSelect(HEART_STRUCTURES[8])}
            >
              {/* Chamber Lumen */}
              <path
                d="M 502 240
                   C 480 268, 480 340, 506 360
                   C 538 376, 576 365, 592 335
                   C 602 285, 578 240, 538 240 Z"
                fill={`url(#grad-arterial-${filterId})`}
                stroke="#541017"
                strokeWidth="2"
              />
              {/* Ostia of pulmonary veins (smooth posterior wall) */}
              <ellipse cx="572" cy="265" rx="5" ry="9" fill="#5E141B" stroke="#9E2A34" strokeWidth="1" opacity="0.8" />
              <ellipse cx="570" cy="295" rx="5" ry="9" fill="#5E141B" stroke="#9E2A34" strokeWidth="1" opacity="0.8" />
            </g>

            {/* 9. INTERVENTRICULAR SEPTUM (Septum interventriculare) */}
            <g id="interventricular-septum">
              <path
                d="M 432 345
                   C 432 405, 438 475, 452 570
                   C 468 570, 474 505, 474 415
                   C 474 365, 468 345, 432 345 Z"
                fill={`url(#grad-septum-${filterId})`}
                stroke="#3D0C13"
                strokeWidth="2"
              />
              {/* Muscular striations in septum */}
              <path d="M 444 380 L 462 390 M 446 430 L 464 440 M 448 480 L 462 490 M 450 530 L 460 540" stroke="#8C2433" strokeWidth="1" opacity="0.5" />
            </g>

            {/* 10. RIGHT VENTRICLE INTERNAL CAVITY (Ventriculus dexter) */}
            <g
              id="structure-right-ventricle"
              className="cursor-pointer transition-opacity"
              opacity={!activeId || activeId === "right-ventricle" ? 1 : 0.35}
              onClick={() => handleSelect(HEART_STRUCTURES[4])}
            >
              <path
                d="M 352 380
                   C 330 430, 335 495, 390 540
                   C 425 565, 440 555, 440 515
                   C 430 445, 425 395, 416 380 Z"
                fill={`url(#grad-venous-${filterId})`}
                stroke="#1B334D"
                strokeWidth="2"
              />
              {/* Trabeculae Carneae (Anatomical muscular columns of RV) */}
              <path d="M 345 445 C 365 465, 380 485, 395 515" stroke="#52789E" strokeWidth="2.5" fill="none" opacity="0.6" strokeLinecap="round" />
              <path d="M 360 475 C 375 495, 390 510, 410 530" stroke="#52789E" strokeWidth="2.5" fill="none" opacity="0.6" strokeLinecap="round" />

              {/* Anterior Papillary Muscle of RV */}
              <path d="M 370 510 C 372 475, 365 440, 360 425 C 365 428, 375 455, 380 500 Z" fill="#6A1A24" stroke="#420D12" strokeWidth="1" />
            </g>

            {/* 11. LEFT VENTRICLE INTERNAL CAVITY & THICK MYOCARDIUM (Ventriculus sinister) */}
            <g
              id="structure-left-ventricle"
              className="cursor-pointer transition-opacity"
              opacity={!activeId || activeId === "left-ventricle" ? 1 : 0.35}
              onClick={() => handleSelect(HEART_STRUCTURES[10])}
            >
              {/* Left Ventricle Lumen (Systemic high-pressure cavity) */}
              <path
                d="M 478 380
                   C 472 435, 468 505, 462 565
                   C 472 600, 508 560, 542 505
                   C 572 455, 572 405, 542 380 Z"
                fill={`url(#grad-arterial-${filterId})`}
                stroke="#541017"
                strokeWidth="2"
              />

              {/* Dense Trabeculae Carneae of Left Ventricle */}
              <path d="M 520 425 C 532 455, 516 490, 486 530" stroke="#BD434E" strokeWidth="2.5" fill="none" opacity="0.6" strokeLinecap="round" />
              <path d="M 535 460 C 542 485, 528 515, 500 550" stroke="#BD434E" strokeWidth="2" fill="none" opacity="0.5" strokeLinecap="round" />

              {/* Robust Anterior & Posterior Papillary Muscles of LV */}
              <path d="M 530 495 C 532 455, 520 420, 510 405 C 516 410, 528 440, 538 485 Z" fill="#6A1A24" stroke="#420D12" strokeWidth="1.25" />
              <path d="M 490 525 C 494 485, 500 445, 505 415 C 502 425, 498 465, 495 515 Z" fill="#6A1A24" stroke="#420D12" strokeWidth="1.25" />
            </g>

            {/* 12. TRICUSPID VALVE (Valva tricuspidalis) & CHORDAE TENDINEAE */}
            <g
              id="structure-tricuspid-valve"
              className="cursor-pointer transition-opacity"
              opacity={!activeId || activeId === "tricuspid-valve" ? 1 : 0.35}
              onClick={() => handleSelect(HEART_STRUCTURES[3])}
            >
              {/* Fibrous Annulus & 3 Cusps */}
              <path d="M 326 370 C 342 386, 355 386, 368 370" fill="none" stroke={`url(#grad-valve-cusp-${filterId})`} strokeWidth="3.5" strokeLinecap="round" />
              <path d="M 368 370 C 380 388, 396 386, 408 370" fill="none" stroke={`url(#grad-valve-cusp-${filterId})`} strokeWidth="3.5" strokeLinecap="round" />
              {/* Delicate Fine Chordae Tendineae (Heart strings) */}
              <path d="M 345 382 L 360 425 M 356 384 L 362 425 M 382 384 L 365 425 M 392 380 L 368 425" stroke="#F5F0E6" strokeWidth="1.25" opacity="0.9" />
            </g>

            {/* 13. MITRAL / BICUSPID VALVE (Valva mitralis) & CHORDAE TENDINEAE */}
            <g
              id="structure-mitral-valve"
              className="cursor-pointer transition-opacity"
              opacity={!activeId || activeId === "mitral-valve" ? 1 : 0.35}
              onClick={() => handleSelect(HEART_STRUCTURES[9])}
            >
              {/* Fibrous Annulus & Bicuspid Leaflets */}
              <path d="M 492 374 C 506 394, 522 394, 536 374" fill="none" stroke={`url(#grad-valve-cusp-${filterId})`} strokeWidth="3.5" strokeLinecap="round" />
              {/* Delicate Fan-like Chordae Tendineae anchored to Papillary Muscles */}
              <path d="M 502 386 L 510 405 M 512 390 L 510 405 M 524 390 L 510 405 M 530 384 L 510 405" stroke="#F5F0E6" strokeWidth="1.25" opacity="0.9" />
              <path d="M 515 390 L 505 415 M 525 388 L 505 415" stroke="#F5F0E6" strokeWidth="1.25" opacity="0.85" />
            </g>

            {/* 14. CORONARY SULCUS FAT & SUPERFICIAL VESSELS (Authentic Textbook Details) */}
            <g id="epicardial-fat-sulcus" opacity="0.75" pointerEvents="none">
              <path d="M 315 365 C 310 380, 312 395, 320 405" stroke={`url(#grad-fat-${filterId})`} strokeWidth="4" fill="none" strokeLinecap="round" />
              <path d="M 622 345 C 628 365, 626 385, 615 405" stroke={`url(#grad-fat-${filterId})`} strokeWidth="4.5" fill="none" strokeLinecap="round" />
            </g>

            {/* ------------------------------------------------------------- */}
            {/* AVANA INTERACTIVE ANNOTATION OVERLAY (LEADER LINES & LABELS)  */}
            {/* ------------------------------------------------------------- */}

            {/* Active Structure Focal Highlight Pin */}
            {activeStructure && (
              <g pointerEvents="none">
                <circle
                  cx={activeStructure.targetPoint.x}
                  cy={activeStructure.targetPoint.y}
                  r="14"
                  fill="none"
                  stroke="#0d9488"
                  strokeWidth="3.5"
                  className="animate-ping"
                  opacity="0.8"
                />
                <circle
                  cx={activeStructure.targetPoint.x}
                  cy={activeStructure.targetPoint.y}
                  r="5.5"
                  fill="#0f766e"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
              </g>
            )}

            {/* Leader Lines and Persian Labels */}
            {HEART_STRUCTURES.map((struct) => {
              const isActive = activeId === struct.id;
              const isDimmed = Boolean(activeId && !isActive);
              const isRightSide = struct.labelPoint.x > 450;

              return (
                <g
                  key={struct.id}
                  id={`label-group-${struct.id}`}
                  className="cursor-pointer transition-all duration-150"
                  opacity={isDimmed ? 0.35 : 1}
                  onClick={() => handleSelect(struct)}
                >
                  {/* Leader Line path with neat elbow joints */}
                  <polyline
                    points={
                      struct.leaderLine.x3 !== undefined && struct.leaderLine.y3 !== undefined
                        ? `${struct.leaderLine.x1},${struct.leaderLine.y1} ${struct.leaderLine.x2},${struct.leaderLine.y2} ${struct.leaderLine.x3},${struct.leaderLine.y3}`
                        : `${struct.leaderLine.x1},${struct.leaderLine.y1} ${struct.leaderLine.x2},${struct.leaderLine.y2}`
                    }
                    fill="none"
                    stroke={isActive ? "#0d9488" : "var(--color-border-hover, #64748b)"}
                    strokeWidth={isActive ? "2.5" : "1.5"}
                    strokeDasharray={isActive ? "none" : "3,2"}
                  />

                  {/* Target Anchor Dot */}
                  <circle
                    cx={struct.targetPoint.x}
                    cy={struct.targetPoint.y}
                    r={isActive ? "5" : "3.5"}
                    fill={isActive ? "#0d9488" : "#475569"}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />

                  {/* Label Pill Box */}
                  <g
                    transform={`translate(${
                      isRightSide ? struct.labelPoint.x : struct.labelPoint.x - 145
                    }, ${struct.labelPoint.y - 14})`}
                  >
                    <rect
                      x="0"
                      y="0"
                      width="145"
                      height="28"
                      rx="7"
                      fill={
                        isActive
                          ? "#0f766e"
                          : "var(--color-surface, #ffffff)"
                      }
                      stroke={
                        isActive
                          ? "#14b8a6"
                          : "var(--color-border, #cbd5e1)"
                      }
                      strokeWidth={isActive ? "2" : "1"}
                      filter={`url(#plate-shadow-${filterId})`}
                    />
                    <text
                      x="72"
                      y="18"
                      textAnchor="middle"
                      fill={isActive ? "#ffffff" : "var(--color-text, #0f172a)"}
                      fontSize="12.5"
                      fontWeight={isActive ? "700" : "600"}
                      fontFamily="Vazirmatn, system-ui, sans-serif"
                    >
                      {struct.persianName}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Structure selection chips */}
      <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-[var(--color-text)]">
            انتخاب ساختار:
          </span>
          <span className="text-[11px] text-[var(--color-text-muted)] hidden sm:inline">
            کلیک برای هایلایت و مطالعه وظیفه فیزیولوژیک
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HEART_STRUCTURES.map((struct) => {
            const isSelected = activeId === struct.id;
            return (
              <button
                key={struct.id}
                type="button"
                onClick={() => handleSelect(struct)}
                className={`px-2 py-1 rounded-lg text-[11px] sm:text-xs font-medium border transition-colors cursor-pointer select-none ${
                  isSelected
                    ? "bg-teal-600 text-white border-teal-600 font-bold shadow-xs"
                    : "bg-[var(--color-surface-warm)] text-[var(--color-text)] border-[var(--color-border)] hover:border-teal-500/50"
                }`}
              >
                {struct.persianName}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Structure Details Banner */}
      <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
        {activeStructure ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-teal-500/10 border border-teal-500/30 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600 dark:text-teal-400 shrink-0" />
              <span className="font-bold text-teal-900 dark:text-teal-100 text-sm">
                {activeStructure.persianName}
              </span>
              <span className="text-[11px] text-[var(--color-text-muted)] font-sans">
                ({activeStructure.englishName})
              </span>
            </div>
            <p className="text-[var(--color-text-secondary)] sm:max-w-xl text-xs leading-relaxed">
              {activeStructure.role}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-text-muted)] py-1">
            <div className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>
                برای مشاهده نام لاتین و نقش فیزیولوژیک هر بخش، روی برچسب‌ها یا خود نگاره تشریحی کلیک کنید.
              </span>
            </div>
            <span className="hidden sm:inline text-[11px] text-slate-400">
              ۱۱ ساختار تشریحی
            </span>
          </div>
        )}
      </div>

      {/* Figure Caption & Medical Textbook Attribution */}
      <div className="mt-3 pt-2 text-center text-xs text-[var(--color-text-muted)] space-y-1">
        <p className="font-medium text-[var(--color-text-secondary)]">
          شکل ۱-۱: مقطع تاجی قدامی قلب انسان — نمایش حفرات چهارگانه، دیواره میوکارد، دستگاه دریچه‌ای و ارتباط عروق اصلی.
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          نگاره تشریحی آموزشی / Academic Anatomical Plate — طراحی وکتوری بر اساس استانداردهای متون مرجع پزشکی (فاقد ادعای تصویربرداری پزشکی تشخیصی)
        </p>
      </div>
    </div>
  );
}
