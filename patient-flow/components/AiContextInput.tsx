"use client";

import React, { useState } from 'react';
import { AiContext } from '../types';

interface Props {
  aiContext: AiContext;
  onChange: (newContext: AiContext) => void;
}

const AiContextInput = ({ aiContext, onChange }: Props) => {
  const [inputs, setInputs] = useState(aiContext.inputs);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newInputs = { ...inputs, [event.target.name]: event.target.value };
    setInputs(newInputs);
    onChange(newInputs);
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h2 className="text-lg font-bold mb-2">Input</h2>
      <form className="space-y-4">
        {Object.keys(inputs).map((key) => (
          <div key={key} className="flex items-center space-x-2">
            <label htmlFor={key} className="block text-sm font-medium text-gray-700">
              {key}
            </label>
            <input
              id={key}
              name={key}
              type="text"
              value={inputs[key]}
              onChange={handleInputChange}
              className="block w-full px-3 py-2 text-sm text-gray-700 placeholder-gray-300 focus:ring-indigo-500 focus:border-indigo-500 border-gray-300 rounded-md"
              aria-label={key}
              aria-describedby="description"
            />
          </div>
        ))}
        <button
          type="button"
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          onClick={() => onChange(inputs)}
        >
          Submit
        </button>
      </form>
    </div>
  );

  return null;
};

export default AiContextInput;
