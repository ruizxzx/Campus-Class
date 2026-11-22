/** Parse the existing five-question Copilot prose without changing generation. */
export type CopilotPracticeQuestion = {
  question: string;
  choices: [string, string, string, string];
  answer: number;
  explanation: string;
  sourceIds: string[];
};

function plain(value: string) {
  return value.replace(/\*\*/g, "").replace(/__/g, "").replace(/`/g, "").trim();
}

export function parseCopilotPractice(text: string): CopilotPracticeQuestion[] | null {
  const clean = text.replace(/\r/g, "").replace(/\*\*/g, "");
  const keyOffset = clean.search(/(?:^|\n)\s*(?:#{1,5}\s*)?(?:answer\s*key|correct\s*answers)\s*[:\-]?/im);
  if (keyOffset < 0) return null;
  const body = clean.slice(0, keyOffset);
  const key = clean.slice(keyOffset);
  const keys = new Map<number, number>();
  const keyRegex = /(?:^|[\s,;|])(?:Q\s*)?([1-5])\s*[.):-]\s*([A-D])\b/gi;
  for (const match of key.matchAll(keyRegex)) {
    keys.set(Number(match[1]), match[2].toUpperCase().charCodeAt(0) - 65);
  }
  const questions: Array<{number: number; question: string; choices: string[]; explanation: string; sourceIds: string[]}> = [];
  let current: (typeof questions)[number] | null = null;
  for (const raw of body.split("\n")) {
    const line = plain(raw.replace(/^\s*#{1,5}\s*/, ""));
    if (!line) continue;
    const heading = line.match(/^(?:(?:Question|Q)\s*)?([1-5])\s*[.):\-]\s*(.+)$/i);
    if (heading) {
      current = {number: Number(heading[1]), question: heading[2].trim(),
        choices: [], explanation: "", sourceIds: []};
      questions.push(current);
      continue;
    }
    if (!current) continue;
    const option = line.match(/^[-*]?\s*\(?([A-D])\)?\s*[.):\-]\s*(.+)$/i);
    if (option && current.choices.length < 4) {
      const index = option[1].toUpperCase().charCodeAt(0) - 65;
      if (index === current.choices.length) current.choices.push(option[2].trim());
      continue;
    }
    if (/^(?:explanation|reason|because)\s*:/i.test(line)) {
      current.explanation += (current.explanation ? " " : "") + line.replace(/^[^:]+:\s*/, "");
    } else if (!current.choices.length) {
      current.question += " " + line;
    }
  }
  if (questions.length !== 5 || new Set(questions.map(q => q.number)).size !== 5) return null;
  const result: CopilotPracticeQuestion[] = [];
  for (const entry of questions) {
    const answer = keys.get(entry.number);
    if (answer === undefined || entry.choices.length !== 4 || !entry.question) return null;
    const sources = [entry.question, ...entry.choices, entry.explanation].join(" ");
    result.push({
      question: entry.question,
      choices: entry.choices as [string, string, string, string],
      answer,
      explanation: entry.explanation,
      sourceIds: [...new Set(sources.match(/\[(?:S|R|P)\d+\]/g) ?? [])].map(s => s.slice(1, -1)),
    });
  }
  return result.sort((a, b) => questions.findIndex(q => q.question === a.question) -
    questions.findIndex(q => q.question === b.question));
}
