"use client";

import React from 'react';
import AiContextInput from '../components/AiContextInput';
import AiContextProcessing from '../components/AiContextProcessing';
import AiContextOutput from '../components/AiContextOutput';

const Home = () => {
  const [aiContext, setAiContext] = React.useState({ inputs: {}, output: '' });

  const handleAiRun = () => {
    // API call to trigger the core mechanic
    fetch('/api/ai/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(aiContext.inputs),
    })
      .then((response) => response.json())
      .then((data) => {
        setAiContext((prevAiContext) => ({ ...prevAiContext, output: data.output }));
      });
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-3xl font-bold mb-2">Haven</h1>
      <AiContextInput aiContext={aiContext} onChange={setAiContext} />
      <button
        type="button"
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        onClick={handleAiRun}
      >
        Run AI
      </button>
      <AiContextProcessing aiContext={aiContext} />
      <AiContextOutput aiContext={aiContext} />
    </div>
  );
};

export default Home;
