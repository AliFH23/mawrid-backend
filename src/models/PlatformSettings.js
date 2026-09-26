import mongoose from 'mongoose';

const platformSettingsSchema = new mongoose.Schema(
  {
    commitmentFeeRate: {
      type: Number,
      default: 0.05,
      min: [0, 'commitmentFeeRate cannot be negative'],
      max: [1, 'commitmentFeeRate cannot exceed 1 (100%)'],
    },

    supplierCommissionRate: {
      type: Number,
      default: 0.02,
      min: [0, 'supplierCommissionRate cannot be negative'],
      max: [1, 'supplierCommissionRate cannot exceed 1 (100%)'],
    },

    buyerCommissionRate: {
      type: Number,
      default: 0.01,
      min: [0, 'buyerCommissionRate cannot be negative'],
      max: [1, 'buyerCommissionRate cannot exceed 1 (100%)'],
    },

    maxSharePerShop: {
      type: Number,
      default: 0.7,
      min: [0.1, 'maxSharePerShop must allow at least 10%'],
      max: [1, 'maxSharePerShop cannot exceed 1 (100%)'],
    },
  },
  {
    timestamps: true,
  }
);

platformSettingsSchema.statics.getSingleton = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

export default mongoose.model('PlatformSettings', platformSettingsSchema);