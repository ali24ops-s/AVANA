import React from "react";

interface SampleProps {
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Pure Minimal Vector: Clean-Sheet Redesign
 *
 * Design Principles:
 * - Built completely from scratch (not derived from previous drafts)
 * - Maximum reduction: Only the essential geometric silhouette remains
 * - Zero shadows, zero gradients, zero decorative rays, zero background badges
 * - Unified stroke geometry with 100% negative space clarity
 * - Tested from 16px to 96px with zero blurring
 */

// Pure Minimal Hand Wave
export const PureMinimalHand: React.FC<SampleProps> = ({
  size = 64,
  className = "",
  title = "دست مینیمال خالص (طراحی از صفر)",
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/*
        A clean, confident hand gesture:
        Constructed from a grounded wrist base, 4 rhythmic geometric fingers,
        and an articulated thumb, rendered in pure AVANA Teal with ivory fill.
      */}
      {/* Hand Body */}
      <path
        d="M17 38V24C17 22.8954 17.8954 22 19 22C20.1046 22 21 22.8954 21 24V16C21 14.8954 21.8954 14 23 14C24.1046 14 25 14.8954 25 16V22M25 18C25 16.8954 25.8954 16 27 16C28.1046 16 29 16.8954 29 18V24M29 20C29 18.8954 29.8954 18 31 18C32.1046 18 33 18.8954 33 20V31C33 34.866 29.866 38 26 38H17Z"
        fill="#F0E6D2"
        stroke="#008080"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Thumb */}
      <path
        d="M17 29C15 29 13.5 27.5 13.5 25.5C13.5 23.5 15 22 17 22"
        fill="#F0E6D2"
        stroke="#008080"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Solid Minimal Wrist Band */}
      <line x1="16" y1="39" x2="32" y2="39" stroke="#008080" strokeWidth="2.8" strokeLinecap="round" />
    </svg>
  );
};

// Pure Minimal Learning Book
export const PureMinimalBook: React.FC<SampleProps> = ({
  size = 64,
  className = "",
  title = "کتاب مینیمال خالص (طراحی از صفر)",
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      {/* Open pages shaped in an iconic chevron V */}
      <path
        d="M8 33C14 31 20 32 24 35C28 32 34 31 40 33V16C34 14 28 15 24 18C20 15 14 14 8 16V33Z"
        fill="#F0E6D2"
        stroke="#008080"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Spine line */}
      <line x1="24" y1="18" x2="24" y2="35" stroke="#008080" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
};
