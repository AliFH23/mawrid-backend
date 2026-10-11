import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import generatePublicId from '../utils/generatePublicId.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },

    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },

    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 6,
      select: false, // never return this field by default, even on a plain find()
    },

    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
    },

    // the base role for every user — this drives permissions across the whole system
    role: {
      type: String,
      enum: {
        values: ['admin', 'supplier', 'buyer'],
        message: 'Role must be admin, supplier, or buyer',
      },
      required: [true, 'Role is required'],
    },

    // human-friendly id the admin can search by (SHP-1001 for shops, SUP-1001 for suppliers).
    // generated automatically on registration; sparse so accounts that have none (admins,
    // or accounts not backfilled yet) don't collide on the unique index
    publicId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },

    // lets an Admin disable a user (bad behavior, fraud...) without deleting them
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt automatically
  }
);

// ─── give every new shop/supplier account its public id ───
userSchema.pre('save', async function (next) {
  try {
    if (this.isNew && !this.publicId) {
      const publicId = await generatePublicId(this.role);
      if (publicId) this.publicId = publicId;
    }
    next();
  } catch (err) {
    next(err);
  }
});

// ─── automatically hash the password before saving ───
// only runs if the password field actually changed
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ─── compare password on login ───
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// never return the password, even if the user gets converted to JSON (e.g. in an API response)
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export default mongoose.model('User', userSchema);