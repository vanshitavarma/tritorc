import mongoose from 'mongoose';

const { Schema } = mongoose;

const ProvenanceSchema = new Schema(
  {
    pageStart: {
      type: Number,
      min: [1, 'pageStart must be >= 1'],
    },
    pageEnd: {
      type: Number,
      min: [1, 'pageEnd must be >= 1'],
    },
    paragraphStart: {
      type: Number,
      min: [1, 'paragraphStart must be >= 1'],
    },
    paragraphEnd: {
      type: Number,
      min: [1, 'paragraphEnd must be >= 1'],
    },
  },
  { _id: false }
);

const DocumentChunkSchema = new Schema(
  {
    documentId: {
      type: String,
      required: [true, 'documentId is required'],
      trim: true,
      index: true,
    },
    scanId: {
      type: String,
      required: [true, 'scanId is required'],
      trim: true,
      index: true,
    },
    chunkIndex: {
      type: Number,
      required: [true, 'chunkIndex is required'],
      min: [0, 'chunkIndex cannot be negative'],
    },
    text: {
      type: String,
      required: [true, 'Chunk text content is required'],
      trim: true,
    },
    provenance: {
      type: ProvenanceSchema,
      default: () => ({}),
    },
    section: {
      type: String,
      default: 'General',
      trim: true,
    },
    embedding: {
      type: [Number],
      default: undefined,
    },
    embeddingModel: {
      type: String,
      trim: true,
    },
    embeddingDimensions: {
      type: Number,
      min: [1, 'embeddingDimensions must be at least 1'],
    },
    contentHash: {
      type: String,
      required: [true, 'contentHash is required'],
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'embedded', 'failed', 'unembedded'],
        message: '{VALUE} is not a valid chunk status',
      },
      default: 'unembedded',
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'document_chunks',
  }
);

// Strict pre-save validation hook: Never mix vectors from different models/dimensions
DocumentChunkSchema.pre('validate', function () {
  if (this.embedding && this.embedding.length > 0) {
    if (!this.embeddingModel || this.embeddingModel.trim() === '') {
      this.invalidate(
        'embeddingModel',
        'embeddingModel is required when an embedding vector is present'
      );
    }
    if (!this.embeddingDimensions || this.embeddingDimensions < 1) {
      this.invalidate(
        'embeddingDimensions',
        'embeddingDimensions must be a positive integer when embedding vector is present'
      );
    }
    if (this.embeddingDimensions && this.embedding.length !== this.embeddingDimensions) {
      this.invalidate(
        'embedding',
        `Vector dimension mismatch: vector length is ${this.embedding.length}, but embeddingDimensions is ${this.embeddingDimensions} for model ${this.embeddingModel}. Vectors cannot be mixed across different models or dimensions.`
      );
    }
    if (
      this.embedding.some((n) => typeof n !== 'number' || Number.isNaN(n) || !Number.isFinite(n))
    ) {
      this.invalidate('embedding', 'Embedding vector must contain only valid finite numbers');
    }
  }
});

// Explicit compound and lookup indexes
DocumentChunkSchema.index({ documentId: 1, chunkIndex: 1 }, { unique: true });
DocumentChunkSchema.index({ scanId: 1, createdAt: -1 });

export const DocumentChunk =
  mongoose.models.DocumentChunk || mongoose.model('DocumentChunk', DocumentChunkSchema);
