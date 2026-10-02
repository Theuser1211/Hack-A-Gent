import type { ReactNode } from 'react';

interface MainContentProps {
  children: ReactNode;
}

const MainContent = ({ children }: MainContentProps) => {
  return (
    <main className="container mx-auto p-4">
      {children}
    </main>
  );
};

export default MainContent;
