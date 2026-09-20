import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A supplier profile must be linked to a user'],
      unique: true,
    },

    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },

    // free-text bio: what the company does, what they typically supply — shown on
    // their own profile page so buyers/admin get more context than just the name
    companyDescription: {
      type: String,
      trim: true,
      default: '',
    },
    
    
    commercialRegistrationNumber: {
      type: String,
      required: [true, 'Commercial registration number is required'],
      trim: true,
    },

    reliabilityScore: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },

    rejectionCount: {
      type: Number,
      default: 0,
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

export default mongoose.model('Supplier', supplierSchema);