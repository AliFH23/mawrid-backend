// One-off: gives a public id to every existing shop/supplier account that doesn't have one yet.
// Run from the backend root, once:   node scripts/backfillPublicIds.js
// Safe to run again — accounts that already have an id are skipped. Oldest accounts get the
// lowest numbers.
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import User from '../src/models/User.js';
import generatePublicId from '../src/utils/generatePublicId.js';

const run = async () => {
  await connectDB();

  const users = await User.find({
    role: { $in: ['buyer', 'supplier'] },
    $or: [{ publicId: { $exists: false } }, { publicId: null }],
  }).sort({ createdAt: 1 });

  console.log(`Found ${users.length} account(s) without a public id`);

  for (const user of users) {
    const publicId = await generatePublicId(user.role);
    // updateOne on purpose: skips validation and the password-hash hook
    await User.updateOne({ _id: user._id }, { $set: { publicId } });
    console.log(`${publicId}  ->  ${user.email}`);
  }

  await mongoose.disconnect();
  console.log('Done');
};

run().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});