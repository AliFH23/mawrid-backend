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

    commitmentFeeAmount: {
      type: Number,
      required: [true, 'Commitment fee amount is required'],
      min: [0, 'Commitment fee cannot be negative'],
    },

    // PAID: fee collected, ACTIVE participation
    // REFUNDED: pool cancelled/expired, or supplier rejected after completion — shop is not at fault
    // FORFEITED: shop withdrew after joining — fee is kept as a deterrent
    commitmentFeeStatus: {
      type: String,
      enum: {
        values: ['PAID', 'REFUNDED', 'FORFEITED'],
        message: '{VALUE} is not a valid commitment fee status',
      },
      default: 'PAID',
    },

    // ACTIVE: shop is currently part of the pool
    // CANCELLED: shop withdrew before the pool completed
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'CANCELLED'],
        message: '{VALUE} is not a valid participation status',
      },
      default: 'ACTIVE',
    },

    // PENDING_DELIVERY: the supplier confirmed the pool, but this shop hasn't confirmed receipt yet
    // DELIVERED: the shop confirmed the goods physically arrived
    deliveryStatus: {
      type: String,
      enum: {
        values: ['PENDING_DELIVERY', 'DELIVERED'],
        message: '{VALUE} is not a valid delivery status',
      },
      default: 'PENDING_DELIVERY',
    },

    deliveredAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // createdAt here doubles as "joinedAt"
  }
);

// a shop can only join a given pool once (they adjust quantity instead of joining twice)
participationSchema.index({ poolId: 1, shopId: 1 }, { unique: true });

export default mongoose.model('Participation', participationSchema);