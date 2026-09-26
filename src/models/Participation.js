import mongoose from 'mongoose';

const participationSchema = new mongoose.Schema(
  {
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pool',
      required: [true, 'Participation must be linked to a pool'],
    },

    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'Participation must be linked to a shop'],
    },

    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },

    paymentMethod: {
      type: String,
      enum: {
        values: ['CARD', 'CASH', 'ZAIN_CASH', 'ORANGE_MONEY', 'CLIQ'],
        message: '{VALUE} is not a valid payment method',
      },
      default: 'CARD',
    },

    commitmentFeeAmount: {
      type: Number,
      required: [true, 'Commitment fee amount is required'],
      min: [0, 'Commitment fee cannot be negative'],
    },

    commitmentFeeStatus: {
      type: String,
      enum: {
        values: ['PAID', 'REFUNDED', 'FORFEITED'],
        message: '{VALUE} is not a valid commitment fee status',
      },
      default: 'PAID',
    },

    finalPaymentStatus: {
      type: String,
      enum: {
        values: ['PENDING', 'PAID'],
        message: '{VALUE} is not a valid final payment status',
      },
      default: 'PENDING',
    },

    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'CANCELLED'],
        message: '{VALUE} is not a valid participation status',
      },
      default: 'ACTIVE',
    },

    deliveryStatus: {
      type: String,
      enum: {
        values: ['PENDING_DELIVERY', 'DELIVERED'],
        message: '{VALUE} is not a valid delivery status',
      },
      default: 'PENDING_DELIVERY',
    },

    rated: {
      type: Boolean,
      default: false,
    },

    deliveredAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

participationSchema.index({ poolId: 1, shopId: 1 }, { unique: true });

export default mongoose.model('Participation', participationSchema);