'use client';

import { useState, memo } from 'react';
import { Check, Send, ChevronLeft, ChevronRight, MessageCircleQuestion } from 'lucide-react';
import type { AskScientistArgs } from '../utils/askScientistUtils';
import type { ToolCallStatus } from './ToolCallDisplay';

interface AskScientistDisplayProps {
  toolCallId: string;
  args: AskScientistArgs;
  status: ToolCallStatus;
  result?: string | null;
  onSubmitAnswers: (toolCallId: string, answers: Record<string, string>) => void;
}

const AskScientistDisplayComponent = ({
  toolCallId,
  args,
  status,
  result,
  onSubmitAnswers,
}: AskScientistDisplayProps) => {
  const questions = args.questions || [];
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [useCustom, setUseCustom] = useState<Record<string, boolean>>({});

  const isCompleted = status === 'completed' || status === 'approved';
  const allAnswered = questions.length > 0 && questions.every((q) => answers[q.id] && answers[q.id].trim() !== '');
  const currentQuestion = questions[currentStep];
  const isLastStep = currentStep === questions.length - 1;

  // Completed state: show summary
  if (isCompleted) {
    const displayResult = result
      ?.replace(/^The scientist answered your questions:\n/, '')
      .replace(/^\{[\s\S]*\}$/, '')
      .trim();
    return (
      <div className="border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 rounded-md my-2 text-xs">
        <div className="flex items-center gap-2 px-3 py-2">
          <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
          <span className="font-medium text-gray-800 dark:text-gray-200">Questions Answered</span>
        </div>
        {displayResult && (
          <div className="px-3 pb-2 border-t border-green-200 dark:border-green-800">
            <pre className="text-[11px] text-gray-600 dark:text-gray-400 whitespace-pre-wrap mt-1.5">
              {displayResult}
            </pre>
          </div>
        )}
      </div>
    );
  }

  if (questions.length === 0) return null;

  const selectPreset = (questionId: string, option: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: option }));
    setUseCustom((prev) => ({ ...prev, [questionId]: false }));
  };

  const selectCustom = (questionId: string) => {
    setUseCustom((prev) => ({ ...prev, [questionId]: true }));
    setAnswers((prev) => ({ ...prev, [questionId]: customInputs[questionId] || '' }));
  };

  const updateCustomInput = (questionId: string, value: string) => {
    setCustomInputs((prev) => ({ ...prev, [questionId]: value }));
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  return (
    <div className="border border-blue-300 dark:border-yellow-700 bg-blue-50 dark:bg-yellow-950/30 rounded-md my-2 text-xs">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <MessageCircleQuestion className="w-3.5 h-3.5 text-blue-600 dark:text-yellow-400" />
        <span className="font-medium text-gray-800 dark:text-gray-200">Questions from AI ({questions.length})</span>
      </div>

      <div className="px-3 pb-3 border-t border-blue-200 dark:border-yellow-800">
        {/* Horizontal stepper */}
        <div className="flex items-center justify-center gap-0.5 py-3">
          {questions.map((q, idx) => (
            <div key={q.id} className="flex items-center">
              <button
                onClick={() => setCurrentStep(idx)}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-colors ${
                  idx === currentStep
                    ? 'bg-blue-500 dark:bg-yellow-500 text-white dark:text-slate-900'
                    : answers[q.id] && answers[q.id].trim()
                      ? 'bg-green-500 dark:bg-green-600 text-white'
                      : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-slate-600'
                }`}
              >
                {answers[q.id] && answers[q.id].trim() && idx !== currentStep ? <Check className="w-3 h-3" /> : idx + 1}
              </button>
              {idx < questions.length - 1 && (
                <div
                  className={`h-0.5 w-4 ${
                    answers[q.id] && answers[q.id].trim()
                      ? 'bg-green-400 dark:bg-green-600'
                      : 'bg-gray-200 dark:bg-slate-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Current question */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-800 dark:text-gray-200">{currentQuestion.question}</p>

          {/* Preset options */}
          <div className="space-y-1.5">
            {currentQuestion.options.map((option) => {
              const isSelected = answers[currentQuestion.id] === option && !useCustom[currentQuestion.id];
              return (
                <button
                  key={option}
                  onClick={() => selectPreset(currentQuestion.id, option)}
                  className={`w-full text-left px-2.5 py-1.5 rounded border text-xs transition-colors ${
                    isSelected
                      ? 'border-blue-500 dark:border-yellow-500 bg-blue-100 dark:bg-yellow-900/40 text-blue-800 dark:text-yellow-200'
                      : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {option}
                </button>
              );
            })}

            {/* Custom answer option */}
            <button
              onClick={() => selectCustom(currentQuestion.id)}
              className={`w-full text-left px-2.5 py-1.5 rounded border text-xs transition-colors ${
                useCustom[currentQuestion.id]
                  ? 'border-blue-500 dark:border-yellow-500 bg-blue-100 dark:bg-yellow-900/40 text-blue-800 dark:text-yellow-200'
                  : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              Other...
            </button>
            {useCustom[currentQuestion.id] && (
              <textarea
                className="w-full px-2.5 py-1.5 rounded border border-gray-200 dark:border-slate-600 text-xs bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:ring-yellow-500"
                rows={2}
                placeholder="Type your answer..."
                value={customInputs[currentQuestion.id] || ''}
                onChange={(e) => updateCustomInput(currentQuestion.id, e.target.value)}
                autoFocus
              />
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-3 pt-2 border-t border-blue-200 dark:border-yellow-800">
          <button
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-3 h-3" />
            Previous
          </button>
          {isLastStep ? (
            <button
              onClick={() => onSubmitAnswers(toolCallId, answers)}
              disabled={!allAnswered}
              className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="w-3 h-3" />
              Submit
            </button>
          ) : (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 dark:text-yellow-400 hover:text-blue-800 dark:hover:text-yellow-200 transition-colors"
            >
              Next
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

AskScientistDisplayComponent.displayName = 'AskScientistDisplay';

export const AskScientistDisplay = memo(AskScientistDisplayComponent);
