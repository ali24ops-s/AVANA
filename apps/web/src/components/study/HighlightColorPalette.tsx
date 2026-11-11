/**
 * Highlight Color Palette Component.
 *
 * Renders a floating palette of exactly 5 distinct highlight colors.
 * Features:
 * - Smart vertical positioning (above if space exists, otherwise below anchor)
 * - Horizontal viewport clamping (never overflows screen)
 * - Preserves DOM text selection on mousedown
 * - Full keyboard & accessibility support
 * - Visual indicator for active color
 */

import React, { useEffect, useRef, useState } from "react";
import {
  HIGHLIGHT_COLORS,
  type HighlightColorId,
} from "./highlightColors.js";

export interface HighlightColorPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  selectedColor: HighlightColorId;
  onSelectColor: (color: HighlightColorId) => void;
  anchorRect: DOMRect | null;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function HighlightColorPalette({
  isOpen,
  onClose,
  selectedColor,
  onSelectColor,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: HighlightColorPaletteProps) {
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (!isOpen || !anchorRect) return;

    const updateCoords = () => {
      const paletteWidth = 192;
      const paletteHeight = 44;

      const spaceAbove = anchorRect.top;
      const spaceBelow = window.innerHeight - anchorRect.bottom;

      let top: number;
      if (spaceAbove >= paletteHeight + 10) {
        // Enough room above
        top = anchorRect.top - paletteHeight - 8;
      } else if (spaceBelow >= paletteHeight + 10) {
        // Room below
        top = anchorRect.bottom + 8;
      } else {
        // Fallback: pick side with more space and clamp
        if (spaceAbove >= spaceBelow) {
          top = Math.max(8, anchorRect.top - paletteHeight - 4);
        } else {
          top = Math.min(window.innerHeight - paletteHeight - 8, anchorRect.bottom + 4);
        }
      }

      // Center horizontally on the anchor
      let left = anchorRect.left + anchorRect.width / 2 - paletteWidth / 2;
      // Clamp horizontally within viewport
      left = Math.max(8, Math.min(window.innerWidth - paletteWidth - 8, left));

      setCoords({ top, left });
    };

    updateCoords();
    window.addEventListener("resize", updateCoords);
    window.addEventListener("scroll", updateCoords, true);

    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords, true);
    };
  }, [isOpen, anchorRect]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (paletteRef.current && !paletteRef.current.contains(target)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !anchorRect) return null;

  return (
    <div
      ref={paletteRef}
      role="group"
      aria-label="انتخاب رنگ هایلایت"
      dir="rtl"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={(e) => {
        // Prevent selection loss when clicking inside palette container
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 1360,
      }}
      className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full shadow-modal backdrop-blur-md animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      {HIGHLIGHT_COLORS.map((color) => {
        const isSelected = selectedColor === color.id;
        return (
          <button
            key={color.id}
            type="button"
            data-testid={`color-choice-${color.id}`}
            aria-label={`رنگ ${color.label}`}
            aria-pressed={isSelected}
            title={color.label}
            onMouseDown={(e) => {
              // Vital: preserve browser text selection
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelectColor(color.id);
            }}
            style={{ backgroundColor: color.dotColor }}
            className={`w-6 h-6 rounded-full cursor-pointer transition-all duration-150 hover:scale-115 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary ${
              isSelected
                ? "ring-2 ring-offset-2 ring-primary dark:ring-offset-gray-900 scale-110 shadow-sm"
                : "opacity-90 hover:opacity-100 hover:shadow-xs"
            }`}
          />
        );
      })}
    </div>
  );
}
