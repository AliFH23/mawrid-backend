import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: {
        values: [
          'COMMITMENT_FEE_PAID',
          'COMMITMENT_FEE_REFUNDED',
          'COMMITMENT_FEE_FORFEITED',
          'FINAL_PAYMENT',
          'SUPPLIER_COMMISSION',
          'BUYER_COMMISSION',
        ],
        message: '{VALUE} is not a valid transaction type',
      },
      required: [true, 'Transaction type is required'],
    },

    amount: {
      type: Number,
      required: [true, 'Transaction amount is required'],
    },

    poolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pool',
      required: [true, 'Transaction must reference a pool'],
    },

    shopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
    },

    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
    },

    description: {
      type: String,
      required: [true, 'A human-readable description is required'],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

transactionSchema.index({ createdAt: -1 });

export default mongoose.model('Transaction', transactionSchema);