import mongoose from 'mongoose';

const { Schema } = mongoose;

const UsageMetadataSchema = new Schema(
  {
    promptTokens: {
      type: Number,
      min: [0, 'promptTokens cannot be negative'],
    },
    candidatesTokens: {
      type: Number,
      min: [0, 'candidatesTokens cannot be negative'],
    },
    totalTokens: {
      type: Number,
      min: [0, 'totalTokens cannot be negative'],
    },
    latencyMs: {
      type: Number,
      min: [0, 'latencyMs cannot be negative'],
    },
  },
  { _id: false }
);

const AIAnalysisSchema = new Schema(
  {
    documentId: {
      type: String,
      required: [true, 'documentId reference is required'],
      trim: true,
      index: true,
    },
    scanId: {
      type: String,
      required: [true, 'scanId reference is required'],
      trim: true,
      index: true,
    },
    analysisType: {
      type: String,
      required: [true, 'analysisType is required'],
      enum: {
        values: ['summarization', 'classification', 'semantic_assessment', 'risk_analysis'],
        message: '{VALUE} is not a valid analysisType',
      },
      default: 'summarization',
      index: true,
    },
    model: {
      type: String,
      required: [true, 'model name is required'],
      trim: true,
    },
    promptVersion: {
      type: String,
      required: [true, 'promptVersion is required'],
      default: 'v1.0',
      trim: true,
    },
    result: {
      type: Schema.Types.Mixed,
      required: [true, 'result JSON payload is required'],
    },
    evidenceChunkIds: [
      {
        type: Schema.Types.Mixed,
      },
    ],
    status: {
      type: String,
      enum: {
        values: ['completed', 'failed', 'fallback'],
        message: '{VALUE} is not a valid AIAnalysis status',
      },
      default: 'completed',
      index: true,
    },
    usageMetadata: {
      type: UsageMetadataSchema,
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
    collection: 'ai_analyses',
  }
);

// Compound and lookup indexes
AIAnalysisSchema.index({ documentId: 1, analysisType: 1 });
AIAnalysisSchema.index({ scanId: 1, createdAt: -1 });

export const AIAnalysis =
  mongoose.models.AIAnalysis || mongoose.model('AIAnalysis', AIAnalysisSchema);
