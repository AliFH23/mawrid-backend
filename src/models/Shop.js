import mongoose from 'mongoose';
import { normalizeRegNumber, attachRegNumberGuards } from '../utils/businessRegistry.js';

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

    // one business = one account: stored normalized (digits/letters only) and unique, so the
    // same commercial registration can't be used by a second shop. Cross-checks against
    // suppliers and the blocklist happen in attachRegNumberGuards below.
    commercialRegistrationNumber: {
      type: String,
      required: [true, 'Commercial registration number is required'],
      trim: true,
      set: normalizeRegNumber,
      unique: true,
    },

    // accumulates from cashback earned on non-cash payments — informational for now,
    // shown to the shop as a running balance (not yet auto-redeemable)
    cashbackBalance: {
      type: Number,
      default: 0,
      min: 0,
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

    // fixed delivery zone chosen from the DeliveryZone collection — not free text,
    // so "Irbid" and "irbid " never end up as two different values by accident
    deliveryZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryZone',
      required: [true, 'Delivery zone is required'],
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

attachRegNumberGuards(shopSchema);

export default mongoose.model('Shop', shopSchema);