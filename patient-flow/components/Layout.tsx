"use client";

import type { ReactNode } from 'react';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Footer } from './Footer';
import { MainContent } from './MainContent';

interface LayoutProps {
  children: ReactNode;
}

const Layout = ({ children }: LayoutProps) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="flex h-screen">
      <Sidebar isOpen={isSidebarOpen} onToggle={handleToggleSidebar} />
      <div className="flex-1">
        <Header onToggleSidebar={handleToggleSidebar} />
        <MainContent>{children}</MainContent>
        <Footer />
      </div>
    </div>
  );
};

export default Layout;
