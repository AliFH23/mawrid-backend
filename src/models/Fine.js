import mongoose from 'mongoose';

const fineSchema = new mongoose.Schema(
  {
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'A fine must be linked to a supplier'],
    },

    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pool',
      required: [true, 'A fine must reference the pool that triggered it'],
    },

    reason: {
      type: String,
      required: [true, 'A reason is required for every fine'],
      trim: true,
    },

    reliabilityScorePenalty: {
      type: Number,
      required: true,
      min: 0,
    },

    reportedToChamberOfCommerce: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

fineSchema.index({ supplierId: 1, createdAt: -1 });

export default mongoose.model('Fine', fineSchema);