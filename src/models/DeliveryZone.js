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

    // the middle of the zone (the "qasaba"), set by the admin on the map. A pin dropped
    // anywhere in Jordan is matched to the nearest zone center, so a zone with no center
    // simply can't be auto-detected (it still works in the manual dropdowns).
    center: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
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