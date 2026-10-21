import Counter from '../models/Counter.js';

// admins don't get a public id — it only exists so support can look up shops, suppliers and couriers
const PREFIX_BY_ROLE = {
  buyer: 'SHP',
  supplier: 'SUP',
  courier: 'DLV',
};

// numbering starts at 1001 so ids always look the same length: SHP-1001, SUP-1001, ...
const START_OFFSET = 1000;

// returns e.g. "SHP-1001", or null for roles that don't get one
const generatePublicId = async (role) => {
  const prefix = PREFIX_BY_ROLE[role];
  if (!prefix) return null;

  const counter = await Counter.findOneAndUpdate(
    { _id: prefix },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return `${prefix}-${START_OFFSET + counter.seq}`;
};

export default generatePublicId;