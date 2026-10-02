import { Document, model, Schema } from 'mongoose';

const aiContextSchema = new Schema(
  {
    userId: String,
    inputs: String,
    timestamps: Date,
  },
  { timestamps: true }
);

export const AiContext = model<Document>('AiContext', aiContextSchema);