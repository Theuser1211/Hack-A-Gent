"use client";

import { useState } from 'react';
import { AiContext } from '../types/AiContext';

interface InputProps {
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  aiContext: AiContext;
}

const Input = ({ onInputChange, aiContext }: InputProps) => {
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onInputChange(event);
    setInputValue(event.target.value);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      // Call the API to trigger the core mechanic
      const response = await fetch('/api/ai/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: inputValue, userId: aiContext.userId }),
      });
      const data = await response.json();
      // Update the state with the result
      // ... handle the result ...
    } catch (error) {
      setError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className='w-full max-w-md mx-auto p-4 bg-white rounded-md shadow-md'>
      <label
        htmlFor='input'
        className='block mb-2 text-sm font-medium text-gray-900 dark:text-gray-300'
      >
        Enter your input or prompt to the AI model
      </label>
      <input
        type='text'
        id='input'
        className='block w-full p-2 pl-10 text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500'
        value={inputValue}
        onChange={handleInputChange}
        placeholder='Enter your input or prompt'
        aria-label='Enter your input or prompt'
      />
      <button
        type='submit'
        className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md'
        disabled={loading}
      >
        {loading ? 'Loading...' : 'Submit'}
      </button>
      {error && (
        <div className='bg-red-500 p-2 mt-2 rounded-md text-white'>{error.message}</div>
      )}
    </form>
  );
};

export default Input;