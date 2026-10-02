import { z } from 'zod';

export interface AiContext {
  userId: string;
  inputs: string;
  timestamps: number;
}

export const AiContextSchema = z.object({
  userId: z.string().min(1, { message: 'User ID is required' }),
  inputs: z.string().min(1, { message: 'Inputs are required' }),
  timestamps: z.number().min(1, { message: 'Timestamps are required' }),
});