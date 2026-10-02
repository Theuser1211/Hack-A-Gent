import React from 'react';
import { AuthInputProps } from './AuthInput';

interface AuthFormProps extends AuthInputProps {}

const AuthForm = ({ onLogin, onRegister }: AuthFormProps) => {
  return (
    <div className='max-w-md mx-auto p-4 bg-white rounded-md shadow-md'>
      <AuthInput onLogin={onLogin} onRegister={onRegister} />
    </div>
  );
};

export default AuthForm;