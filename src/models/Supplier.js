import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    // link to the underlying account (role must be "supplier")
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A supplier profile must be linked to a user'],
      unique: true, // one user = one supplier profile
    },

    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },

    // tracks how often this supplier confirms vs rejects completed pools
    // used to throttle or block unreliable suppliers from opening new pools
    reliabilityScore: {
      type: Number,
      default: 100, // starts at 100, drops with each rejection after pool completion
      min: 0,
      max: 100,
    },

    rejectionCount: {
      type: Number,
      default: 0,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Supplier', supplierSchema);