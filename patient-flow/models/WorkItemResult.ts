import { Document, model, Schema } from 'mongoose';

const workItemResultSchema = new Schema(
  {
    id: String,
    type: String,
    status: String,
    outputSnapshot: String,
  },
  { timestamps: true }
);

export const WorkItemResult = model<Document>('WorkItemResult', workItemResultSchema);