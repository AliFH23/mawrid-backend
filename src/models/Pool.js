import mongoose from 'mongoose';

const poolSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },

    deliveryZone: {
      type: String,
      required: [true, 'Delivery zone is required'],
      trim: true,
    },

    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'A pool must be linked to a supplier'],
    },

    // who scheduled this pool (an Admin or the Supplier proposing it)
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'createdBy is required'],
    },

    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative'],
    },

    // minimum quantity the supplier requires before wholesale pricing kicks in
    minQuantity: {
      type: Number,
      required: [true, 'Minimum quantity is required'],
      min: [1, 'Minimum quantity must be at least 1'],
    },

    // updated automatically as shops join (sum of all active Participation quantities)
    currentQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    // hard cap to prevent the pool from exceeding what the supplier can actually fulfill
    maxQuantity: {
      type: Number,
      required: [true, 'Maximum quantity is required'],
      validate: {
        validator: function (value) {
          return value >= this.minQuantity;
        },
        message: 'Maximum quantity must be greater than or equal to minimum quantity',
      },
    },

    status: {
      type: String,
      enum: {
        values: [
          'OPEN',
          'PENDING_SUPPLIER_CONFIRMATION',
          'COMPLETED',
          'EXPIRED',
          'CANCELLED',
        ],
        message: '{VALUE} is not a valid pool status',
      },
      default: 'OPEN',
    },

    expiryDate: {
      type: Date,
      required: [true, 'Expiry date is required'],
    },
  },
  {
    timestamps: true,
  }
);

// convenience field, not stored in the database — handy for the frontend progress bar
poolSchema.virtual('completionPercentage').get(function () {
  if (this.minQuantity === 0) return 0;
  return Math.min(100, Math.round((this.currentQuantity / this.minQuantity) * 100));
});

poolSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Pool', poolSchema);