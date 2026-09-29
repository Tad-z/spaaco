import { Schema, model } from 'mongoose';
import type { Model } from 'mongoose';
import type { IRecognitionDirectory } from '../interfaces/recognition-directory.interface.js';
import { contentPlugin } from './plugins/content.plugin.js';

/** A directory that ranks the firm, with a page of its own (ADR-056). */
const recognitionDirectorySchema = new Schema<IRecognitionDirectory>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    logo: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    heroSubtitle: { type: String, default: null, trim: true, maxlength: 600 },
    heroImages: [{ type: Schema.Types.ObjectId, ref: 'Media' }],
  },
  { timestamps: true, strict: 'throw' }
);

recognitionDirectorySchema.plugin(contentPlugin, { source: 'name' });

recognitionDirectorySchema.index({ status: 1, order: 1 });

export const RecognitionDirectory: Model<IRecognitionDirectory> = model<IRecognitionDirectory>(
  'RecognitionDirectory',
  recognitionDirectorySchema
);
