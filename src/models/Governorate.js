import mongoose from 'mongoose';

const governorateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Governorate name is required'],
      unique: true,
      trim: true,
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

export default mongoose.model('Governorate', governorateSchema);