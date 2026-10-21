import mongoose from 'mongoose';

// commercial-registration numbers the platform refuses (fraud, repeated abuse, ...).
// A number in this list can't be used to register or edit a shop/supplier profile.
const blockedBusinessSchema = new mongoose.Schema(
  {
    // stored in the normalized form (see utils/businessRegistry.js)
    number: {
      type: String,
      required: [true, 'Registration number is required'],
      unique: true,
      trim: true,
    },

    reason: {
      type: String,
      trim: true,
      default: '',
    },

    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('BlockedBusiness', blockedBusinessSchema);