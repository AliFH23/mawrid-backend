import mongoose from 'mongoose';

const deliveryZoneSchema = new mongoose.Schema(
  {
    governorateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Governorate',
      required: [true, 'A delivery zone must belong to a governorate'],
    },

    name: {
      type: String,
      required: [true, 'Delivery zone name is required'],
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

// the same area name can exist under different governorates (e.g. "وسط البلد" in more
// than one city), but not duplicated twice under the exact same governorate
deliveryZoneSchema.index({ governorateId: 1, name: 1 }, { unique: true });

export default mongoose.model('DeliveryZone', deliveryZoneSchema);