import { AiContext } from '../types/AiContext';

interface AuthEmptyProps {
}

const AuthEmpty = ({ }: AuthEmptyProps) => {
  return (
    <div className='flex justify-center items-center h-screen bg-gray-100'>
      <h2 className='text-2xl text-gray-700'>
        Please login to access the app
      </h2>
    </div>
  );
};

export default AuthEmpty;
