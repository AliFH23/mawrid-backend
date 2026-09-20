import mongoose from 'mongoose';

const poolSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    categoryIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Category',
        },
      ],
      validate: {
        validator: function (value) {
          return value.length >= 1;
        },
        message: 'At least one category is required',
      },
      required: [true, 'At least one category is required'],
    },

    deliveryZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryZone',
      required: [true, 'Delivery zone is required'],
    },

    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'Pool must belong to a supplier'],
    },

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

    minQuantity: {
      type: Number,
      required: [true, 'Minimum quantity is required'],
      min: [1, 'Minimum quantity must be at least 1'],
    },

    maxQuantity: {
      type: Number,
      required: [true, 'Maximum quantity is required'],
      validate: {
        validator: function (value) {
          return value >= this.minQuantity;
        },
        message: 'maxQuantity must be greater than or equal to minQuantity',
      },
    },

    currentQuantity: {
      type: Number,
      default: 0,
      min: [0, 'currentQuantity cannot be negative'],
    },

    status: {
      type: String,
      enum: {
        values: ['OPEN', 'PENDING_SUPPLIER_CONFIRMATION', 'COMPLETED', 'EXPIRED', 'CANCELLED'],
        message: '{VALUE} is not a valid pool status',
      },
      default: 'OPEN',
    },

    expiryDate: {
      type: Date,
      required: [true, 'Expiry date is required'],
    },

    extended: {
      type: Boolean,
      default: false,
    },
    
  },
  {
    timestamps: true,
  }
);

poolSchema.virtual('completionPercentage').get(function () {
  return Math.min(100, (this.currentQuantity / this.minQuantity) * 100);
});

poolSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Pool', poolSchema);