import { Document, model, Schema } from 'mongoose';

const userPrefsSchema = new Schema(
  {
    seedable: Boolean,
  },
  { timestamps: true }
);

export const UserPrefs = model<Document>('UserPrefs', userPrefsSchema);