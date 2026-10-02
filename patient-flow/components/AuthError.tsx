import { AiContext } from '../types/AiContext';

interface AuthErrorProps {
  error: string | null;
}

const AuthError = ({ error }: AuthErrorProps) => {
  if (error) {
    return (
      <div className='bg-red-500 text-white p-2 rounded mt-2'>
        {error}
      </div>
    );
  }

  return null;
};

export default AuthError;
