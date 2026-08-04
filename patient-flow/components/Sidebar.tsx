import type { ReactNode } from 'react';
import { useState } from 'react';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}

const Sidebar = ({ isOpen, onToggle }: SidebarProps) => {
  return (
    <div
      className={`fixed top-0 left-0 h-screen w-64 bg-white p-4 transition-width duration-300 ${
        isOpen ? 'w-64' : 'w-0'
      }`}
    >
      <button onClick={onToggle} className="absolute top-4 right-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>
      <nav aria-label="Sidebar navigation">
        <ul>
          <li>
            <a href="#" className="block py-2 px-4 hover:bg-gray-100">
              Input
            </a>
          </li>
          <li>
            <a href="#" className="block py-2 px-4 hover:bg-gray-100">
              Processing
            </a>
          </li>
          <li>
            <a href="#" className="block py-2 px-4 hover:bg-gray-100">
              Output
            </a>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
