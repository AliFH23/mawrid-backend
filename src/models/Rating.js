import mongoose from 'mongoose';

const ratingSchema = new mongoose.Schema(
  {
    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'A rating must be linked to a shop'],
    },

    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'A rating must be linked to a supplier'],
    },

    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pool',
      required: [true, 'A rating must reference the pool it is about'],
    },

    stars: {
      type: Number,
      required: [true, 'A star rating (1-5) is required'],
      min: 1,
      max: 5,
    },

    comment: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

ratingSchema.index({ shopId: 1, poolId: 1 }, { unique: true });

export default mongoose.model('Rating', ratingSchema);