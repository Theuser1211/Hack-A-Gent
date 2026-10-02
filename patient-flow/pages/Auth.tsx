"use client";

import { AiContext } from '../types/AiContext';
import { useState } from 'react';
import AuthInput from '../components/AuthInput';
import AuthLoading from '../components/AuthLoading';
import AuthError from '../components/AuthError';
import AuthEmpty from '../components/AuthEmpty';

interface AuthProps {
  aiContext: AiContext;
}

const Auth = ({ aiContext }: AuthProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // Handle input change
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    // Call API to authenticate user
    setTimeout(() => {
      setLoading(false);
      setError(null);
    }, 2000);
  };

  return (
    <div className='flex flex-col h-screen bg-gray-100'>
      <AuthInput
        onInputChange={handleInputChange}
        onFormSubmit={handleFormSubmit}
        loading={loading}
        error={error}
      />
      <AuthLoading loading={loading} />
      <AuthError error={error} />
      <AuthEmpty />
    </div>
  );
};

export default Auth;
