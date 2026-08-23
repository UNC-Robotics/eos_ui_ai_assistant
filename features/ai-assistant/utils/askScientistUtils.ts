/**
 * Types and utilities for the ask_scientist tool.
 */

export interface AskScientistQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface AskScientistArgs {
  questions: AskScientistQuestion[];
}

/** Format the scientist's answers into a human-readable string for the LLM. */
export function formatScientistAnswers(questions: AskScientistQuestion[], answers: Record<string, string>): string {
  const lines = questions.map((q, idx) => {
    const answer = answers[q.id] || '(no answer)';
    return `${idx + 1}. ${q.question} → ${answer}`;
  });
  return `The scientist answered your questions:\n${lines.join('\n')}`;
}
