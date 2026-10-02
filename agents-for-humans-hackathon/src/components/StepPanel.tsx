interface StepPanelProps {
  children: React.ReactNode;
  className?: string;
}

export function StepPanel({
  children,
  className = '',
}: StepPanelProps) {
  return (
    <section className={
      "mt-6 space-y-6" +
      (className ? ` ${className}` : "")
    }>
      {children}
    </section>
  );
}
