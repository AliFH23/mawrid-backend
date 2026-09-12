import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true, // prevents accidentally creating two categories with the same name
      trim: true,
    },

    // optional — makes it easy to show an icon next to each category on the frontend later
    icon: {
      type: String,
      default: 'default',
    },

    // lets an Admin disable a category without deleting it (e.g. if shops/pools already reference it)
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Category', categorySchema);