import mongoose from 'mongoose';

const { Schema } = mongoose;

const BaselineMatchSchema = new Schema(
  {
    keyword: {
      type: String,
      required: [true, 'Keyword is required in match'],
      trim: true,
    },
    hits: {
      type: Number,
      required: [true, 'Hits count is required'],
      min: [1, 'Hits must be at least 1'],
    },
    firstIndex: {
      type: Number,
      min: [0, 'First index position cannot be negative'],
    },
  },
  { _id: false }
);

const FileMetadataSchema = new Schema(
  {
    mimeType: {
      type: String,
      trim: true,
      default: 'application/octet-stream',
    },
    sizeBytes: {
      type: Number,
      min: [0, 'File size cannot be negative'],
    },
    pageCount: {
      type: Number,
      min: [1, 'Page count must be at least 1'],
    },
    characterCount: {
      type: Number,
      default: 0,
      min: [0, 'Character count cannot be negative'],
    },
    contentHash: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const TenderDocumentSchema = new Schema(
  {
    documentId: {
      type: String,
      required: [true, 'documentId is required'],
      unique: true,
      trim: true,
      index: true,
    },
    scanId: {
      type: String,
      required: [true, 'scanId reference is required'],
      trim: true,
      index: true,
    },
    originalFileName: {
      type: String,
      required: [true, 'originalFileName is required'],
      trim: true,
    },
    documentName: {
      type: String,
      required: [true, 'documentName is required'],
      trim: true,
    },
    documentType: {
      type: String,
      enum: {
        values: ['TENDER', 'SCOPE_OF_WORK', 'PROCUREMENT_DOCUMENT', 'NON_TENDER', 'UNKNOWN'],
        message: '{VALUE} is not a valid documentType',
      },
      default: 'TENDER',
      index: true,
    },
    isValidTender: {
      type: Boolean,
      default: true,
      index: true,
    },
    fileMetadata: {
      type: FileMetadataSchema,
      required: [true, 'fileMetadata is required'],
    },
    extractionStatus: {
      type: String,
      enum: {
        values: ['success', 'failed', 'rejected', 'review_needed'],
        message: '{VALUE} is not a valid extractionStatus',
      },
      default: 'success',
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    classificationReasons: [
      {
        type: String,
        trim: true,
      },
    ],
    baselineMatches: [BaselineMatchSchema],
    distinctCount: {
      type: Number,
      default: 0,
      min: [0, 'distinctCount cannot be negative'],
    },
    totalHits: {
      type: Number,
      default: 0,
      min: [0, 'totalHits cannot be negative'],
    },
    baselineVerdict: {
      type: String,
      enum: {
        values: ['Related', 'Possible', 'Not Related', 'Not Assessed'],
        message: '{VALUE} is not a valid baselineVerdict',
      },
      default: 'Not Related',
      index: true,
    },
    tenderFields: {
      type: Map,
      of: Schema.Types.Mixed,
      default: () => new Map(),
    },
    ingestionStatus: {
      type: String,
      enum: {
        values: ['pending', 'indexed', 'skipped', 'failed'],
        message: '{VALUE} is not a valid ingestionStatus',
      },
      default: 'pending',
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
    collection: 'tender_documents',
  }
);

// Explicit compound indexes
TenderDocumentSchema.index({ scanId: 1, createdAt: -1 });
TenderDocumentSchema.index({ documentType: 1, baselineVerdict: 1 });
TenderDocumentSchema.index({ 'fileMetadata.contentHash': 1 });

export const TenderDocument =
  mongoose.models.TenderDocument || mongoose.model('TenderDocument', TenderDocumentSchema);
