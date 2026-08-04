import { AiContext } from '../types/AiContext';

interface AuthLoadingProps {
  loading: boolean;
}

const AuthLoading = ({ loading }: AuthLoadingProps) => {
  if (loading) {
    return (
      <div className='flex justify-center items-center h-screen bg-gray-100'>
        <div className='animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-400'></div>
      </div>
    );
  }

  return null;
};

export default AuthLoading;
