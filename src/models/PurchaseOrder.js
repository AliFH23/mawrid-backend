import mongoose from 'mongoose';

const SUPPLIER_COMMISSION_RATE = 0.02;
const BUYER_COMMISSION_RATE = 0.01;

const purchaseOrderSchema = new mongoose.Schema(
  {
    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pool',
      required: [true, 'Purchase order must be linked to a pool'],
    },

    totalQuantity: {
      type: Number,
      required: [true, 'Total quantity is required'],
      min: [0, 'Total quantity cannot be negative'],
    },

    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative'],
    },

    supplierCommission: {
      type: Number,
      required: [true, 'Supplier commission is required'],
      min: [0, 'Supplier commission cannot be negative'],
    },

    buyersCommission: {
      type: Number,
      required: [true, 'Buyers commission is required'],
      min: [0, 'Buyers commission cannot be negative'],
    },

    status: {
      type: String,
      enum: {
        values: ['CONFIRMED', 'REJECTED'],
        message: '{VALUE} is not a valid purchase order status',
      },
      required: [true, 'Status is required'],
    },

    confirmedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

purchaseOrderSchema.statics.calculateCommissions = function (totalAmount) {
  return {
    supplierCommission: Math.round(totalAmount * SUPPLIER_COMMISSION_RATE * 100) / 100,
    buyersCommission: Math.round(totalAmount * BUYER_COMMISSION_RATE * 100) / 100,
  };
};

purchaseOrderSchema.statics.SUPPLIER_COMMISSION_RATE = SUPPLIER_COMMISSION_RATE;
purchaseOrderSchema.statics.BUYER_COMMISSION_RATE = BUYER_COMMISSION_RATE;

export default mongoose.model('PurchaseOrder', purchaseOrderSchema);