import mongoose from 'mongoose';

const shopSchema = new mongoose.Schema(
  {
    // link to the underlying account (role must be "buyer")
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A shop must be linked to a user'],
      unique: true, // one user = one shop profile
    },

    shopName: {
      type: String,
      required: [true, 'Shop name is required'],
      trim: true,
    },

    // many-to-many with Category, capped at 3
    categoryIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Category',
        },
      ],
      validate: {
        validator: function (value) {
          return value.length >= 1 && value.length <= 3;
        },
        message: 'A shop must have between 1 and 3 categories',
      },
      required: [true, 'At least one category is required'],
    },

    // fixed delivery zone chosen from a predefined list (city/area), not free GPS
    deliveryZone: {
      type: String,
      required: [true, 'Delivery zone is required'],
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

export default mongoose.model('Shop', shopSchema);