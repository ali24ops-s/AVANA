import { describe, expect, it } from "vitest";
import { evaluateQuestionAnswer, isStudentAnswerCorrect } from "../question-shuffling.js";

describe("Canonical evaluateQuestionAnswer in @avana/domain", () => {
  const sampleMCQ = {
    question: "مکانیسم اثر کاپتوپریل چیست؟",
    choices: [
      "مهار گیرنده‌های بتا",
      "مهار آنزیم تبدیل‌کننده آنژیوتانسین (ACE)",
      "بلوک کانال کلسیم",
      "تحریک آلفا-۱",
    ],
    correctAnswer: "مهار آنزیم تبدیل‌کننده آنژیوتانسین (ACE)",
    questionType: "multiple_choice",
  };

  describe("Single Choice (MCQ)", () => {
    it("evaluates exact choice text correctly", () => {
      const res = evaluateQuestionAnswer("مهار آنزیم تبدیل‌کننده آنژیوتانسین (ACE)", sampleMCQ);
      expect(res.status).toBe("correct");
      expect(res.scoreRatio).toBe(1);
      expect(res.correctValues).toEqual(["مهار آنزیم تبدیل‌کننده آنژیوتانسین (ACE)"]);
      expect(res.selectedValues).toEqual(["مهار آنزیم تبدیل‌کننده آنژیوتانسین (ACE)"]);
    });

    it("evaluates numeric index correctly (0-based index 1)", () => {
      const res = evaluateQuestionAnswer(1, sampleMCQ);
      expect(res.status).toBe("correct");
      expect(res.scoreRatio).toBe(1);
    });

    it("evaluates string index correctly ('1')", () => {
      const res = evaluateQuestionAnswer("1", sampleMCQ);
      expect(res.status).toBe("correct");
    });

    it("evaluates English letter B correctly", () => {
      const res = evaluateQuestionAnswer("B", sampleMCQ);
      expect(res.status).toBe("correct");
      const resLower = evaluateQuestionAnswer("b", sampleMCQ);
      expect(resLower.status).toBe("correct");
    });

    it("evaluates Persian letter 'ب' correctly", () => {
      const res = evaluateQuestionAnswer("ب", sampleMCQ);
      expect(res.status).toBe("correct");
      const resOption = evaluateQuestionAnswer("گزینه ۲", sampleMCQ);
      expect(resOption.status).toBe("correct");
    });

    it("evaluates wrong choice as incorrect", () => {
      const res = evaluateQuestionAnswer("مهار گیرنده‌های بتا", sampleMCQ);
      expect(res.status).toBe("incorrect");
      expect(res.scoreRatio).toBe(0);

      const resWrongIndex = evaluateQuestionAnswer(0, sampleMCQ);
      expect(resWrongIndex.status).toBe("incorrect");

      const resWrongLetter = evaluateQuestionAnswer("A", sampleMCQ);
      expect(resWrongLetter.status).toBe("incorrect");
    });

    it("evaluates null, undefined, and empty string as unanswered", () => {
      expect(evaluateQuestionAnswer(null, sampleMCQ).status).toBe("unanswered");
      expect(evaluateQuestionAnswer(undefined, sampleMCQ).status).toBe("unanswered");
      expect(evaluateQuestionAnswer("", sampleMCQ).status).toBe("unanswered");
      expect(evaluateQuestionAnswer([], sampleMCQ).status).toBe("unanswered");
    });
  });

  describe("True / False", () => {
    const tfQuestion = {
      question: "آسپرین یک داروی ضدالتهاب غیراستروئیدی است.",
      choices: ["درست", "نادرست"],
      correctAnswer: true,
      questionType: "true_false",
    };

    it("evaluates boolean true vs boolean true correctly", () => {
      expect(evaluateQuestionAnswer(true, tfQuestion).status).toBe("correct");
      expect(evaluateQuestionAnswer(false, tfQuestion).status).toBe("incorrect");
    });

    it("evaluates Persian string 'درست' and 'صحیح' correctly", () => {
      expect(evaluateQuestionAnswer("درست", tfQuestion).status).toBe("correct");
      expect(evaluateQuestionAnswer("صحیح", tfQuestion).status).toBe("correct");
      expect(evaluateQuestionAnswer("نادرست", tfQuestion).status).toBe("incorrect");
      expect(evaluateQuestionAnswer("غلط", tfQuestion).status).toBe("incorrect");
    });

    it("evaluates unanswered for null/empty in True/False", () => {
      expect(evaluateQuestionAnswer(null, tfQuestion).status).toBe("unanswered");
      expect(evaluateQuestionAnswer("", tfQuestion).status).toBe("unanswered");
    });
  });

  describe("Multi-Select", () => {
    const multiQuestion = {
      question: "کدام داروها متعلق به دسته بتابلاکرها هستند؟",
      choices: ["متوپرولول", "آتنولول", "لوزارتان", "کاپتوپریل"],
      correctAnswer: ["متوپرولول", "آتنولول"],
      questionType: "multi_select",
    };

    it("evaluates all correct choices as correct (order-independent)", () => {
      const res1 = evaluateQuestionAnswer(["متوپرولول", "آتنولول"], multiQuestion);
      expect(res1.status).toBe("correct");
      expect(res1.scoreRatio).toBe(1);

      // Reversed order
      const res2 = evaluateQuestionAnswer(["آتنولول", "متوپرولول"], multiQuestion);
      expect(res2.status).toBe("correct");
      expect(res2.scoreRatio).toBe(1);

      // Using indices [1, 0]
      const res3 = evaluateQuestionAnswer([1, 0], multiQuestion);
      expect(res3.status).toBe("correct");
    });

    it("evaluates subset of correct choices without any wrong choices as partial", () => {
      const res = evaluateQuestionAnswer(["متوپرولول"], multiQuestion);
      expect(res.status).toBe("partial");
      expect(res.scoreRatio).toBe(0.5);
      expect(res.selectedValues).toEqual(["متوپرولول"]);
      expect(res.correctValues).toEqual(["متوپرولول", "آتنولول"]);
    });

    it("evaluates any incorrect choice as incorrect even if some correct choices are present", () => {
      const res = evaluateQuestionAnswer(["متوپرولول", "لوزارتان"], multiQuestion);
      expect(res.status).toBe("incorrect");
      expect(res.scoreRatio).toBe(0);
    });

    it("evaluates empty array as unanswered", () => {
      const res = evaluateQuestionAnswer([], multiQuestion);
      expect(res.status).toBe("unanswered");
      expect(res.scoreRatio).toBe(0);
    });
  });

  describe("Backward compatibility with isStudentAnswerCorrect", () => {
    it("delegates to evaluateQuestionAnswer and returns boolean", () => {
      expect(isStudentAnswerCorrect("مهار آنزیم تبدیل‌کننده آنژیوتانسین (ACE)", sampleMCQ)).toBe(true);
      expect(isStudentAnswerCorrect("مهار گیرنده‌های بتا", sampleMCQ)).toBe(false);
      expect(isStudentAnswerCorrect(null, sampleMCQ)).toBe(false);
    });
  });
});
