import mongoose from 'mongoose';

const courierSchema = new mongoose.Schema(
  {
    // link to the underlying account (role must be "courier")
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A courier profile must be linked to a user'],
      unique: true, // one user = one courier profile
    },

    // the one zone this courier serves. The governorate comes from the zone itself, so a
    // courier is always "same governorate + same zone" as the orders he can see.
    deliveryZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryZone',
      required: [true, 'Delivery zone is required'],
    },

    vehicleType: {
      type: String,
      enum: {
        values: ['MOTORCYCLE', 'CAR', 'VAN', 'TRUCK'],
        message: '{VALUE} is not a valid vehicle type',
      },
      default: 'MOTORCYCLE',
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

export default mongoose.model('Courier', courierSchema);