import Pool from '../models/Pool.js';
import Participation from '../models/Participation.js';

// finds every OPEN or PENDING_SUPPLIER_CONFIRMATION pool whose expiryDate has passed,
// marks it EXPIRED, and refunds every active participant's commitment fee in full
// (the shops did nothing wrong — the pool simply ran out of time)
const expirePools = async () => {
  const expiredPools = await Pool.find({
    status: { $in: ['OPEN', 'PENDING_SUPPLIER_CONFIRMATION'] },
    expiryDate: { $lt: new Date() },
  });

  for (const pool of expiredPools) {
    await Participation.updateMany(
      { poolId: pool._id, status: 'ACTIVE' },
      { commitmentFeeStatus: 'REFUNDED' }
    );

    pool.status = 'EXPIRED';
    await pool.save();

    console.log(`Pool ${pool._id} (${pool.productName}) expired — participants refunded`);
  }

  return expiredPools.length;
};

export default expirePools;