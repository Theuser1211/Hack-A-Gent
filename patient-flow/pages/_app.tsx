import React from 'react';
import { AiContext } from '../types';

interface Props {
  Component: React.ComponentType;
  pageProps: any;
}

const MyApp = ({ Component, pageProps }: Props) => {
  return (
    <div className="max-w-md mx-auto p-4">
      <Component {...pageProps} />
    </div>
  );
};

export default MyApp;
