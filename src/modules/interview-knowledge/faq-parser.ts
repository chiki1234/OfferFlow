export type ParsedFaqBlock =
  | {
      index: number;
      status: "valid";
      question: string;
      answer: string;
      raw: string;
    }
  | {
      index: number;
      status: "invalid";
      question: string | null;
      answer: string | null;
      raw: string;
      error: string;
    };

export function parseFaqBlocks(input: string): ParsedFaqBlock[] {
  return input
    .split(/^\s*---\s*$/m)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw, index) => parseBlock(raw, index));
}

function parseBlock(raw: string, index: number): ParsedFaqBlock {
  const lines = raw.split(/\r?\n/);
  const questionLine = lines.findIndex((line) => /^\s*Q\s*:/i.test(line));
  const answerLine = lines.findIndex(
    (line, lineIndex) => lineIndex > questionLine && /^\s*A\s*:/i.test(line),
  );
  if (questionLine < 0 || answerLine < 0) {
    return {
      index,
      status: "invalid",
      question: questionLine >= 0 ? stripMarker(lines[questionLine], "Q") : null,
      answer: null,
      raw,
      error: "FAQ Block 需要同时包含 Q: 和 A:",
    };
  }
  const question = stripMarker(lines[questionLine], "Q");
  const answer = [stripMarker(lines[answerLine], "A"), ...lines.slice(answerLine + 1)]
    .join("\n")
    .trim();
  if (!question || !answer) {
    return {
      index,
      status: "invalid",
      question: question || null,
      answer: answer || null,
      raw,
      error: "FAQ 的问题和答案不能为空",
    };
  }
  return { index, status: "valid", question, answer, raw };
}

function stripMarker(line: string, marker: "Q" | "A") {
  return line.replace(new RegExp(`^\\s*${marker}\\s*:\\s*`, "i"), "").trim();
}
