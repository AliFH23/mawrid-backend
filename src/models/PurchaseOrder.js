import mongoose from 'mongoose';

const COMMISSION_RATE = 0.02; // 2% — used for both the supplier side and the buyers' side

const purchaseOrderSchema = new mongoose.Schema(
  {
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pool',
      required: [true, 'Purchase order must be linked to a pool'],
      unique: true, // one pool produces at most one purchase order
    },

    totalQuantity: {
      type: Number,
      required: [true, 'Total quantity is required'],
      min: [1, 'Total quantity must be at least 1'],
    },

    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative'],
    },

    // 2% of totalAmount, paid by the supplier
    supplierCommission: {
      type: Number,
      required: true,
      min: 0,
    },

    // 2% of totalAmount, paid collectively by participating shops
    buyersCommission: {
      type: Number,
      required: true,
      min: 0,
    },

    // status of the supplier's final confirmation after the pool hit its minimum quantity
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'CONFIRMED', 'REJECTED'],
        message: '{VALUE} is not a valid purchase order status',
      },
      default: 'PENDING',
    },

    confirmedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// calculates both commission amounts from a total order value
// used when a Pool completes and a PurchaseOrder is created
purchaseOrderSchema.statics.calculateCommissions = function (totalAmount) {
  const supplierCommission = Math.round(totalAmount * COMMISSION_RATE * 100) / 100;
  const buyersCommission = Math.round(totalAmount * COMMISSION_RATE * 100) / 100;
  return { supplierCommission, buyersCommission };
};

export default mongoose.model('PurchaseOrder', purchaseOrderSchema);