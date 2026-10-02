import React from 'react';

interface AuthErrorProps {}

const AuthError = ({ error }: AuthErrorProps) => {
  return (
    <p className='text-red-500'>{error}</p>
  );
};

export default AuthError;