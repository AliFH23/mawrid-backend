import mongoose from 'mongoose';
import Participation from '../models/Participation.js';

// a shop needs at least this many finished orders (delivered or withdrawn) before it
// gets a score — one lucky delivery shouldn't read as "100% reliable"
export const MIN_ORDERS_FOR_SCORE = 3;

const LEVELS = [
  { min: 90, level: 'EXCELLENT' },
  { min: 70, level: 'GOOD' },
  { min: 50, level: 'FAIR' },
  { min: 0, level: 'POOR' },
];

// score = share of finished orders the shop actually followed through on.
// "delivered" = shop received the goods; "withdrawn" = shop left a pool after joining
// (its commitment fee is forfeited). Orders still in progress don't count either way.
export const computeReliability = ({ delivered = 0, withdrawn = 0 }) => {
  const finished = delivered + withdrawn;
  if (finished < MIN_ORDERS_FOR_SCORE) {
    return { score: null, level: 'NEW', delivered, withdrawn };
  }
  const score = Math.round((delivered / finished) * 100);
  const { level } = LEVELS.find((l) => score >= l.min);
  return { score, level, delivered, withdrawn };
};

// one query for any number of shops → Map(shopId string → reliability)
export const getShopsReliability = async (shopIds) => {
  const ids = [...new Set(shopIds.map(String))].map((id) => new mongoose.Types.ObjectId(id));
  const map = new Map(ids.map((id) => [String(id), computeReliability({})]));
  if (ids.length === 0) return map;

  const rows = await Participation.aggregate([
    { $match: { shopId: { $in: ids } } },
    {
      $group: {
        _id: '$shopId',
        delivered: {
          $sum: { $cond: [{ $and: [{ $eq: ['$status', 'ACTIVE'] }, { $eq: ['$deliveryStatus', 'DELIVERED'] }] }, 1, 0] },
        },
        withdrawn: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
      },
    },
  ]);

  rows.forEach((r) => map.set(String(r._id), computeReliability(r)));
  return map;
};