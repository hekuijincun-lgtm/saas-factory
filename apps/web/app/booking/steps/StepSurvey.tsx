'use client';

import type { SurveyQuestion } from '@/src/types/settings';

interface Props {
  questions: SurveyQuestion[];
  answers: Record<string, string | boolean>;
  onAnswer: (id: string, value: string | boolean) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function StepSurvey({ questions, answers, onAnswer, onNext, onBack }: Props) {
  const enabled = questions.filter(q => q.enabled);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          className="p-1 text-brand-muted hover:text-brand-text transition-colors"
          aria-label="戻る"
        >
          ←
        </button>
        <h2 className="text-lg font-semibold text-brand-text">事前アンケート</h2>
      </div>

      <p className="text-sm text-brand-muted">ご予約前にいくつかご回答ください（任意）</p>

      {enabled.length === 0 ? (
        <p className="text-sm text-brand-muted text-center py-4">質問はありません</p>
      ) : (
        <div className="space-y-5">
          {enabled.map((q, idx) => (
            <div key={q.id}>
              <label className="block text-sm font-medium text-brand-text mb-1.5">
                <span className="text-brand-muted mr-1.5">{idx + 1}.</span>
                {q.label}
              </label>
              {q.type === 'text' && (
                <input
                  type="text"
                  className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors"
                  value={String(answers[q.id] ?? '')}
                  onChange={e => onAnswer(q.id, e.target.value)}
                />
              )}
              {q.type === 'textarea' && (
                <textarea
                  rows={3}
                  className="w-full px-4 py-3 border border-brand-border rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary transition-colors resize-none"
                  value={String(answers[q.id] ?? '')}
                  onChange={e => onAnswer(q.id, e.target.value)}
                />
              )}
              {q.type === 'checkbox' && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(answers[q.id])}
                    onChange={e => onAnswer(q.id, e.target.checked)}
                    className="w-4 h-4 text-brand-primary border-brand-border rounded focus:ring-brand-primary"
                  />
                  <span className="text-sm text-brand-text">はい</span>
                </label>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onNext}
        className="w-full py-4 bg-brand-primary text-white rounded-2xl font-semibold hover:shadow-md transition-all"
      >
        次へ
      </button>
    </div>
  );
}
