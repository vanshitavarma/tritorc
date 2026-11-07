import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { relevanceConfig } from '../config/relevance.js';

const { Schema } = mongoose;

const FileCountsSchema = new Schema(
  {
    total: {
      type: Number,
      required: true,
      min: [0, 'Total file count must be non-negative'],
    },
    successful: {
      type: Number,
      default: 0,
      min: [0, 'Successful file count must be non-negative'],
    },
    failed: {
      type: Number,
      default: 0,
      min: [0, 'Failed file count must be non-negative'],
    },
    rejected: {
      type: Number,
      default: 0,
      min: [0, 'Rejected file count must be non-negative'],
    },
    reviewNeeded: {
      type: Number,
      default: 0,
      min: [0, 'Review-needed file count must be non-negative'],
    },
  },
  { _id: false }
);

const ConfigSnapshotSchema = new Schema(
  {
    thresholds: {
      relatedMinDistinct: {
        type: Number,
        default: () => relevanceConfig?.relatedMinDistinct ?? 3,
      },
      relatedMinTotalHits: {
        type: Number,
        default: () => relevanceConfig?.relatedMinTotalHits ?? 10,
      },
      possibleMinDistinct: {
        type: Number,
        default: () => relevanceConfig?.possibleMinDistinct ?? 1,
      },
      maxWordGap: {
        type: Number,
        default: () => relevanceConfig?.maxWordGap ?? 1,
      },
    },
    keywordsCount: {
      type: Number,
      default: 20,
      min: [1, 'Keywords count must be at least 1'],
    },
    aiEnabled: {
      type: Boolean,
      default: () => env.aiEnabled,
    },
    generationModel: {
      type: String,
      default: () => env.geminiGenerationModel,
      trim: true,
    },
    embeddingModel: {
      type: String,
      default: () => env.geminiEmbeddingModel,
      trim: true,
    },
    embeddingDimensions: {
      type: Number,
      default: () => env.embeddingDimensions,
      min: [1, 'Embedding dimensions must be at least 1'],
    },
    vectorIndexName: {
      type: String,
      default: () => env.vectorIndexName,
      trim: true,
    },
  },
  { _id: false }
);

const ScanSchema = new Schema(
  {
    scanId: {
      type: String,
      required: [true, 'scanId is required'],
      unique: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'processing', 'completed', 'failed'],
        message: '{VALUE} is not a valid scan status',
      },
      default: 'completed',
      index: true,
    },
    fileCounts: {
      type: FileCountsSchema,
      required: [true, 'fileCounts snapshot is required'],
    },
    configSnapshot: {
      type: ConfigSnapshotSchema,
      default: () => ({}),
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'scans',
  }
);

// Compound and auxiliary query indexes
ScanSchema.index({ status: 1, createdAt: -1 });

export const Scan = mongoose.models.Scan || mongoose.model('Scan', ScanSchema);
