import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { VerificationBadge } from "../components/pocket/VerificationBadge.js";
import { AssertionCard } from "../components/pocket/AssertionCard.js";
import type { PublishedAssertionItem } from "../lib/api/pocket.js";

describe("AVANA Pocket Phase 6.2.2: P0 Clinical Verification Badge Correction", () => {
  const baseAssertion: PublishedAssertionItem = {
    id: "asst-uuid-1",
    assertionRootId: "root-uuid-1",
    versionNumber: 1,
    previousVersionId: null,
    aggregateType: "drug",
    aggregateId: "drug-uuid-1",
    assertionType: "dosing_rule",
    assertionKey: "atorva.dosing.initial",
    statementText: "دوز شروع معمول آتورواستاتین ۱۰ تا ۲۰ میلی‌گرم روزانه است.",
    jurisdiction: "IR",
    targetPopulation: "بزرگسالان",
    clinicalSetting: "سرپایی",
    validUntilDate: null,
    publishedAt: "2026-01-15T08:00:00Z",
    isClinicallyVerified: false,
    verifiedAt: null,
  };

  describe("1. VerificationBadge Component Direct Tests", () => {
    it("renders unverified neutral badge when isVerified is false", () => {
      render(<VerificationBadge isVerified={false} verifiedAt={null} size="sm" />);

      const unverifiedBadge = screen.getByTestId("verification-badge-unverified");
      expect(unverifiedBadge).toBeInTheDocument();
      expect(screen.getByText("تأیید بالینی احراز نشده است")).toBeInTheDocument();
      expect(screen.queryByText("تأییدشده بالینی")).not.toBeInTheDocument();
    });

    it("renders unverified neutral badge when isVerified is false even if a date is accidentally passed", () => {
      render(
        <VerificationBadge
          isVerified={false}
          verifiedAt="2026-01-15T08:00:00Z"
          size="md"
        />,
      );

      expect(screen.getByTestId("verification-badge-unverified")).toBeInTheDocument();
      expect(screen.getByText("تأیید بالینی احراز نشده است")).toBeInTheDocument();
      expect(screen.queryByText("تأییدشده بالینی")).not.toBeInTheDocument();
    });

    it("renders verified green badge when isVerified is true with formatted date", () => {
      render(
        <VerificationBadge
          isVerified={true}
          verifiedAt="2026-03-25T12:00:00Z"
          size="md"
        />,
      );

      const verifiedBadge = screen.getByTestId("verification-badge-verified");
      expect(verifiedBadge).toBeInTheDocument();
      expect(screen.getByText("تأییدشده بالینی")).toBeInTheDocument();
      expect(screen.queryByText("تأیید بالینی احراز نشده است")).not.toBeInTheDocument();
    });
  });

  describe("2. AssertionCard Badge Integration Tests", () => {
    it("renders unverified badge when assertion is published but not clinically verified", () => {
      render(
        <MemoryRouter>
          <AssertionCard assertion={baseAssertion} />
        </MemoryRouter>,
      );

      // Must NOT display "تأییدشده بالینی"
      expect(screen.queryByText("تأییدشده بالینی")).not.toBeInTheDocument();
      // Must display "تأیید بالینی احراز نشده است"
      expect(screen.getByText("تأیید بالینی احراز نشده است")).toBeInTheDocument();
      expect(screen.getByTestId("verification-badge-unverified")).toBeInTheDocument();
    });

    it("renders verified badge when assertion is clinically verified", () => {
      const verifiedAssertion: PublishedAssertionItem = {
        ...baseAssertion,
        isClinicallyVerified: true,
        verifiedAt: "2026-03-25T12:00:00Z",
      };

      render(
        <MemoryRouter>
          <AssertionCard assertion={verifiedAssertion} />
        </MemoryRouter>,
      );

      expect(screen.getByText("تأییدشده بالینی")).toBeInTheDocument();
      expect(screen.getByTestId("verification-badge-verified")).toBeInTheDocument();
      expect(screen.queryByText("تأیید بالینی احراز نشده است")).not.toBeInTheDocument();
    });

    it("ensures publishedAt is never used as verifiedAt date", () => {
      const publishedDate = new Date("2026-01-15T08:00:00Z");
      const verifiedDate = new Date("2026-03-25T12:00:00Z");

      const publishedFa = publishedDate.toLocaleDateString("fa-IR");
      const verifiedFa = verifiedDate.toLocaleDateString("fa-IR");

      const verifiedAssertion: PublishedAssertionItem = {
        ...baseAssertion,
        publishedAt: publishedDate.toISOString(),
        isClinicallyVerified: true,
        verifiedAt: verifiedDate.toISOString(),
      };

      render(
        <MemoryRouter>
          <AssertionCard assertion={verifiedAssertion} />
        </MemoryRouter>,
      );

      // Badge must contain the verified date, NOT the published date
      const verifiedBadge = screen.getByTestId("verification-badge-verified");
      expect(verifiedBadge).toHaveTextContent(verifiedFa);
      expect(verifiedBadge).not.toHaveTextContent(publishedFa);
    });
  });
});
