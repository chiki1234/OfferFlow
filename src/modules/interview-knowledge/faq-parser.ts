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
  const lines = input.split(/\r?\n/);
  const questionLines = lines.flatMap((line, lineIndex) =>
    matchMarker(line, "Q") ? [lineIndex] : [],
  );

  return questionLines.map((startLine, index) => {
    const endLine = questionLines[index + 1] ?? lines.length;
    return parseBlock(lines.slice(startLine, endLine), index);
  });
}

function parseBlock(lines: string[], index: number): ParsedFaqBlock {
  const questionMatch = matchMarker(lines[0] ?? "", "Q");
  const answerLine = lines.findIndex((line, lineIndex) =>
    lineIndex > 0 && matchMarker(line, "A"),
  );
  const contentEnd = lines.findIndex((line, lineIndex) =>
    lineIndex > Math.max(answerLine, 0) && isMarkdownBoundary(line),
  );
  const blockLines = lines.slice(0, contentEnd < 0 ? lines.length : contentEnd);
  const raw = blockLines.join("\n").trim();
  const question = questionMatch?.[1].trim() ?? "";

  if (!question) {
    return {
      index,
      status: "invalid",
      question: null,
      answer: null,
      raw,
      error: "FAQ 的问题不能为空",
    };
  }

  const answerMatch = answerLine < 0 ? null : matchMarker(lines[answerLine], "A");
  const answer = answerLine < 0
    ? ""
    : [answerMatch?.[1] ?? "", ...blockLines.slice(answerLine + 1)].join("\n").trim();

  return { index, status: "valid", question, answer, raw };
}

function matchMarker(line: string, marker: "Q" | "A") {
  return line.match(new RegExp(`^\\s*(?:#{1,6}\\s*)?${marker}\\s*[:：]\\s*(.*)$`, "i"));
}

function isMarkdownBoundary(line: string) {
  return /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
    || /^\s*#{1,6}(?:\s+|$)/.test(line);
}
