import React from 'react';
import { AiContext } from '../types';

interface Props {
  aiContext: AiContext;
}

const AiContextOutput = ({ aiContext }: Props) => {
  return (
    <div className="max-w-md mx-auto p-4">
      <h2 className="text-lg font-bold mb-2">Output</h2>
      <div className="bg-gray-200 rounded-md p-2">
        <p className="text-sm text-gray-700">{aiContext.output}</p>
      </div>
    </div>
  );

  return null;
};

export default AiContextOutput;
