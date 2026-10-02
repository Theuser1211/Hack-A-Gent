import { z } from 'zod';

export interface WorkItemResult {
  id: string;
  type: string;
  status: string;
  outputSnapshot: string;
}

export const WorkItemResultSchema = z.object({
  id: z.string().min(1, { message: 'ID is required' }),
  type: z.string().min(1, { message: 'Type is required' }),
  status: z.string().min(1, { message: 'Status is required' }),
  outputSnapshot: z.string().min(1, { message: 'Output snapshot is required' }),
});