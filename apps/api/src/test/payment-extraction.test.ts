import { describe, it, expect } from "vitest";
import {
  extractPaymentInfoFromRules,
  sanitizePaymentText,
  normalizePersianDigits,
} from "@avana/domain";

describe("Payment Extraction & Sanitization Engine", () => {
  describe("1. Persian & English Digits Normalization", () => {
    it("converts Persian digits to ASCII", () => {
      expect(normalizePersianDigits("۱۲۳۴۵۶۷۸۹۰")).toBe("1234567890");
    });

    it("converts Arabic digits to ASCII", () => {
      expect(normalizePersianDigits("١٢٣٤٥٦٧٨٩٠")).toBe("1234567890");
    });
  });

  describe("2. Security Sanitization & PII Redaction", () => {
    it("masks 16-digit bank card numbers preserving only the last 4 digits", () => {
      const raw = "انتقال وجه از کارت 5894631131738239 انجام شد.";
      const sanitized = sanitizePaymentText(raw);
      expect(sanitized).not.toContain("5894631131738239");
      expect(sanitized).toContain("**** **** **** 8239");
    });

    it("masks spaced 16-digit card numbers with Persian digits", () => {
      const raw = "کارت مبدا: ۵۸۹۴-۶۳۱۱-۳۱۷۳-۱۲۳۴ مبلغ ۲۹۹٬۰۰۰ تومان";
      const sanitized = sanitizePaymentText(raw);
      expect(sanitized).not.toContain("۵۸۹۴");
      expect(sanitized).toContain("**** **** **** 1234");
    });

    it("redacts CVV2 codes in Persian and English", () => {
      const raw = "اطلاعات کارت: CVV2: 456 و سی وی وی ۲: ۷۸۹ رمز پویا: 123456";
      const sanitized = sanitizePaymentText(raw);
      expect(sanitized).not.toContain("456");
      expect(sanitized).not.toContain("۷۸۹");
      expect(sanitized).toContain("CVV2: ***");
      expect(sanitized).toContain("سی وی وی 2: ***");
    });

    it("redacts OTP and dynamic passwords", () => {
      const raw = "رمز پویا: 987654 و رمز دوم: 4321 و OTP: 556677";
      const sanitized = sanitizePaymentText(raw);
      expect(sanitized).not.toContain("987654");
      expect(sanitized).not.toContain("556677");
      expect(sanitized).toContain("رمز پویا: [REDACTED]");
      expect(sanitized).toContain("OTP: [REDACTED]");
    });
  });

  describe("3. Rule-Based Extraction Across Persian Bank SMS Templates", () => {
    it("parses Bank Mellat SMS with Persian digits and Tomans", () => {
      const text = `
بانک ملت
برداشت از: ۶۰۳۷۹۹******۴۳۲۱
مبلغ: ۲۹۹٬۰۰۰ تومان
شماره پیگیری: ۱۲۳۴۵۶۷۸۹
تاریخ: ۱۴۰۴/۱۲/۱۵
ساعت: ۱۴:۳۰
به نام: علی رضایی
`;
      const result = extractPaymentInfoFromRules(text);
      expect(result.data.amount).toBe(299000);
      expect(result.data.currency).toBe("toman");
      expect(result.data.trackingNumber).toBe("123456789");
      expect(result.data.sourceCardLast4).toBe("4321");
      expect(result.data.paymentDate).toBe("1404/12/15");
      expect(result.data.paymentTime).toBe("14:30");
      expect(result.data.payerName).toBe("علی رضایی");
      expect(result.confidence.amount).toBe("high");
      expect(result.confidence.trackingNumber).toBe("high");
      expect(result.missingFields).toHaveLength(0);
    });

    it("parses Bank Melli SMS with Rial amounts and converts accurately to Toman", () => {
      const text = `
بانک ملی ایران
انتقال از کارت: 6037991827365678
مبلغ: 2,990,000 ریال
شماره ارجاع: 987654321
تاریخ: 1404-12-16
زمان: 09:45
`;
      const result = extractPaymentInfoFromRules(text, { expectedAmount: 299000 });
      // 2,990,000 Rials must be converted to 299,000 Tomans
      expect(result.data.amount).toBe(299000);
      expect(result.data.rawAmount).toBe(2990000);
      expect(result.data.currency).toBe("rial");
      expect(result.data.trackingNumber).toBe("987654321");
      expect(result.data.sourceCardLast4).toBe("5678");
      expect(result.data.paymentDate).toBe("1404/12/16");
      expect(result.data.paymentTime).toBe("09:45");
    });

    it("parses BluBank transaction text", () => {
      const text = `
بلو
انتقال موفق ۲۹۹۰۰۰ تومان
به کارت علی محمدلو
کارت مبدا: ۶۲۱۹۸۶******۹۰۱۲
کد پیگیری: ۵۵۴۴۳۳۲۲۱۱
۱۴۰۴/۱۲/۱۴ - ۱۸:۲۵
`;
      const result = extractPaymentInfoFromRules(text);
      expect(result.data.amount).toBe(299000);
      expect(result.data.trackingNumber).toBe("5544332211");
      expect(result.data.sourceCardLast4).toBe("9012");
      expect(result.data.paymentDate).toBe("1404/12/14");
      expect(result.data.paymentTime).toBe("18:25");
    });

    it("parses Bank Pasargad SMS with Ref / Trx labels", () => {
      const text = `
بانک پاسارگاد
کارت: ****3344
مبلغ: 99,000 تومان
کد پیگیری: TRX88776655
تاریخ: 1404/11/20 ساعت 11:15
`;
      const result = extractPaymentInfoFromRules(text);
      expect(result.data.amount).toBe(99000);
      expect(result.data.trackingNumber).toBe("TRX88776655");
      expect(result.data.sourceCardLast4).toBe("3344");
      expect(result.data.paymentDate).toBe("1404/11/20");
      expect(result.data.paymentTime).toBe("11:15");
    });

    it("parses Bank Saman SMS with RRN and date with dots", () => {
      const text = `
بانک سامان
برداشت: 599000 تومان
کارت: 6219861011129988
شماره ارجاع: 1122334455
تاریخ: 1404.10.05 16:40
`;
      const result = extractPaymentInfoFromRules(text);
      expect(result.data.amount).toBe(599000);
      expect(result.data.trackingNumber).toBe("1122334455");
      expect(result.data.sourceCardLast4).toBe("9988");
      expect(result.data.paymentDate).toBe("1404/10/05");
      expect(result.data.paymentTime).toBe("16:40");
    });

    it("does not mistake destination card for source card", () => {
      const destinationCard = "5894631131738239";
      const text = `
انتقال کارت به کارت
مبلغ: ۲۹۹٬۰۰۰ تومان
به کارت: ۵۸۹۴۶۳۱۱۳۱۷۳۸۲۳۹ (علی محمدلو)
از کارت: ۶۰۳۷۹۹******۱۱۱۱
پیگیری: ۹۹۸۸۷۷
`;
      const result = extractPaymentInfoFromRules(text, {
        destinationCardNumber: destinationCard,
      });
      expect(result.data.sourceCardLast4).toBe("1111");
      expect(result.data.sourceCardLast4).not.toBe("8239");
      expect(result.data.trackingNumber).toBe("998877");
    });

    it("reports missing fields when information is incomplete", () => {
      const incompleteText = "مبلغ ۲۹۹٬۰۰۰ تومان به حساب واریز شد.";
      const result = extractPaymentInfoFromRules(incompleteText);
      expect(result.data.amount).toBe(299000);
      expect(result.data.trackingNumber).toBeNull();
      expect(result.data.sourceCardLast4).toBeNull();
      expect(result.missingFields).toContain("trackingNumber");
      expect(result.missingFields).toContain("sourceCardLast4");
    });
  });
});
