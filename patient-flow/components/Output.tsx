"use client";

import { useState, useEffect } from 'react';
import { AiContext } from '../types/AiContext';

interface OutputProps {
  aiContext: AiContext;
}

const Output = ({ aiContext }: OutputProps) => {
  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Call the API to get the result
    const fetchResult = async () => {
      try {
        const response = await fetch('/api/ai/history', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          params: {
            userId: aiContext.userId,
          },
        });
        const data = await response.json();
        // Update the state with the result
        setOutput(data);
      } catch (error) {
        setError(error);
      }
    };
    fetchResult();
  }, []);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      // Call the API to trigger the core mechanic
      const response = await fetch('/api/ai/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: aiContext.inputs, userId: aiContext.userId }),
      });
      const data = await response.json();
      // Update the state with the result
      setOutput(data);
    } catch (error) {
      setError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='w-full max-w-md mx-auto p-4 bg-white rounded-md shadow-md'>
      <h2 className='text-lg font-bold mb-2'>Output</h2>
      {loading ? (
        <div className='bg-gray-200 p-2 rounded-md'>Loading...</div>
      ) : (
        <div className='bg-gray-200 p-2 rounded-md'>{output}</div>
      )}
      <button
        type='button'
        className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md'
        onClick={handleRefresh}
      >
        Refresh
      </button>
      {error && (
        <div className='bg-red-500 p-2 mt-2 rounded-md text-white'>{error.message}</div>
      )}
    </div>
  );
};

export default Output;