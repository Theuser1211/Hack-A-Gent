import { z } from 'zod';

export interface Feedback {
  userId: string;
  inputId: string;
  adjustment: string;
}

export const FeedbackSchema = z.object({
  userId: z.string().min(1, { message: 'User ID is required' }),
  inputId: z.string().min(1, { message: 'Input ID is required' }),
  adjustment: z.string().min(1, { message: 'Adjustment is required' }),
});