import { cn } from '@/lib/utils';

type Step = { id: string; label: string };

type Props = {
  steps: Step[];
  currentStepId: string;
  onStepClick?: (id: string) => void;
};

export function Stepper({ steps, currentStepId, onStepClick }: Props) {
  return (
    <nav aria-label="Progress">
      <ol className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-4">
        {steps.map((step, idx) => {
          const isCurrent = step.id === currentStepId;
          const isCompleted = steps.findIndex((s) => s.id === currentStepId) > idx;
          const clickable = isCompleted && onStepClick;
          return (
            <li key={step.id} className="flex-1">
              <button
                type="button"
                onClick={() => clickable && onStepClick(step.id)}
                disabled={!clickable}
                className={cn(
                  'w-full text-center py-2 px-4 rounded transition-colors',
                  isCurrent ? 'bg-indigo-600 text-white' : isCompleted ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' : 'bg-gray-100 text-gray-500 cursor-not-allowed',
                )}
                aria-current={isCurrent ? 'step' : undefined}
                aria-disabled={!clickable && !isCurrent && !isCompleted}
              >
                {step.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
