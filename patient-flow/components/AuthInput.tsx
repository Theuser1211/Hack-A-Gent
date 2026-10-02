"use client";

import { useState } from 'react';
import { AiContext } from '../types/AiContext';

interface AuthInputProps {
  onInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onFormSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  error: string | null;
}

const AuthInput = ({ onInputChange, onFormSubmit, loading, error }: AuthInputProps) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    if (name === 'username') {
      setUsername(value);
    } else if (name === 'password') {
      setPassword(value);
    }
  };

  const handleFormSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onFormSubmit(event);
  };

  return (
    <form className='flex flex-col gap-2 p-4 bg-white rounded-md shadow-md' onSubmit={handleFormSubmit}>
      <label className='block text-gray-700 text-sm font-bold mb-2' htmlFor='username'>
        Username
      </label>
      <input
        className='shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline'
        id='username'
        type='text'
        name='username'
        value={username}
        onChange={handleInputChange}
        placeholder='Username'
        aria-label='Username'
      />

      <label className='block text-gray-700 text-sm font-bold mb-2' htmlFor='password'>
        Password
      </label>
      <input
        className='shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline'
        id='password'
        type='password'
        name='password'
        value={password}
        onChange={handleInputChange}
        placeholder='Password'
        aria-label='Password'
      />

      <button
        className='bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded'
        type='submit'
        disabled={loading}
      >
        {loading ? 'Loading...' : 'Login'}
      </button>

      {error && (
        <div className='bg-red-500 text-white p-2 rounded mt-2'>
          {error}
        </div>
      )}
    </form>
  );
};

export default AuthInput;
