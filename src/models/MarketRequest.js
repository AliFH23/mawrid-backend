import mongoose from 'mongoose';

// a "market request": a shop says "I want product X", other shops back it with the
// quantity THEY would take, and a supplier sees the total demand and opens a pool.
// Backing a request costs nothing — the commitment fee only applies once a shop
// actually joins the resulting pool.
const marketRequestSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },

    description: {
      type: String,
      trim: true,
    },

    categoryIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
      validate: {
        validator: (value) => value.length >= 1 && value.length <= 3,
        message: 'A request must have between 1 and 3 categories',
      },
      required: [true, 'At least one category is required'],
    },

    // taken from the creating shop's own delivery zone
    deliveryZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryZone',
      required: [true, 'Delivery zone is required'],
    },

    createdByShop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: [true, 'A request must belong to a shop'],
    },

    // one entry per shop (the creator is the first voter)
    votes: [
      {
        _id: false,
        shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', required: true },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],

    // OPEN -> FULFILLED (a supplier opened a pool for it)
    //      -> EXPIRED   (nobody opened a pool before expiresAt)
    //      -> CLOSED    (creator closed it, or every vote was withdrawn)
    status: {
      type: String,
      enum: {
        values: ['OPEN', 'FULFILLED', 'EXPIRED', 'CLOSED'],
        message: '{VALUE} is not a valid request status',
      },
      default: 'OPEN',
    },

    expiresAt: {
      type: Date,
      required: [true, 'expiresAt is required'],
    },

    // set when a supplier turns the request into a real pool
    poolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pool' },
    fulfilledBySupplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier' },
    fulfilledAt: { type: Date },
  },
  { timestamps: true }
);

marketRequestSchema.index({ status: 1, expiresAt: 1 });
marketRequestSchema.index({ 'votes.shopId': 1 });

export default mongoose.model('MarketRequest', marketRequestSchema);