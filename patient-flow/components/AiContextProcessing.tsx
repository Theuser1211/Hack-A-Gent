import React from 'react';
import { AiContext } from '../types';

interface Props {
  aiContext: AiContext;
}

const AiContextProcessing = ({ aiContext }: Props) => {
  return (
    <div className="max-w-md mx-auto p-4">
      <h2 className="text-lg font-bold mb-2">Processing</h2>
      <div className="flex items-center space-x-2">
        <div className="bg-gray-200 rounded-md p-2">
          <p className="text-sm text-gray-700">Model working...</p>
        </div>
      </div>
    </div>
  );

  return null;
};

export default AiContextProcessing;
