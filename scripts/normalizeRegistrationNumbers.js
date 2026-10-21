// One-off cleanup before turning on the "one business = one account" rule.
// Run from the backend root:
//   node scripts/normalizeRegistrationNumbers.js            (report only — changes nothing)
//   node scripts/normalizeRegistrationNumbers.js --apply    (normalizes the stored numbers)
//
// It (1) rewrites every stored number in its normalized form and (2) lists numbers that
// more than one profile uses. It NEVER deletes or merges accounts: duplicates are listed so
// you decide which account to keep (e.g. disable the extra one from the users page).
// Fix duplicates BEFORE restarting the server, otherwise the new unique index can't build.
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Shop from '../src/models/Shop.js';
import Supplier from '../src/models/Supplier.js';
import User from '../src/models/User.js';
import { normalizeRegNumber } from '../src/utils/businessRegistry.js';

const apply = process.argv.includes('--apply');

const run = async () => {
  await connectDB();

  const profiles = [];
  for (const [kind, Model] of [['shop', Shop], ['supplier', Supplier]]) {
    // lean(): read the raw stored values, without the model's normalizing setter
    const docs = await Model.find().lean();
    docs.forEach((d) => profiles.push({ kind, Model, doc: d, normalized: normalizeRegNumber(d.commercialRegistrationNumber) }));
  }

  // 1) numbers that aren't stored normalized yet
  let changed = 0;
  for (const p of profiles) {
    if (p.doc.commercialRegistrationNumber !== p.normalized) {
      changed += 1;
      console.log(`normalize [${p.kind}] "${p.doc.commercialRegistrationNumber}" -> "${p.normalized}"`);
      // the native driver on purpose: skips the model hooks while cleaning legacy data
      if (apply) await p.Model.collection.updateOne({ _id: p.doc._id }, { $set: { commercialRegistrationNumber: p.normalized } });
    }
  }
  console.log(`${changed} number(s) ${apply ? 'normalized' : 'would be normalized (run with --apply)'}`);

  // 2) the same number used by more than one profile
  const byNumber = new Map();
  profiles.forEach((p) => {
    if (!byNumber.has(p.normalized)) byNumber.set(p.normalized, []);
    byNumber.get(p.normalized).push(p);
  });
  const duplicates = [...byNumber.entries()].filter(([, list]) => list.length > 1);

  if (duplicates.length === 0) {
    console.log('No duplicate registration numbers');
  } else {
    console.log(`\n${duplicates.length} number(s) used by more than one profile:`);
    for (const [number, list] of duplicates) {
      console.log(`\n  ${number}`);
      for (const p of list) {
        const user = await User.findById(p.doc.userId).select('email publicId isActive');
        console.log(`    - ${p.kind}  ${user?.publicId || '(no id)'}  ${user?.email}  ${user?.isActive ? 'active' : 'DISABLED'}`);
      }
    }
    console.log('\nDecide which account keeps each number, then change/disable the others before restarting the server.');
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});