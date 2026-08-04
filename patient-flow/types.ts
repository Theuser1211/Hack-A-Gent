import { AiContext } from 'haven-types';

interface AiContext {
  inputs: {
    [key: string]: string;
  };
  output: string;
}

export { AiContext };
