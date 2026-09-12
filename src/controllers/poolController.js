import mongoose from 'mongoose';
import Pool from '../models/Pool.js';
import Supplier from '../models/Supplier.js';
import Category from '../models/Category.js';
import Shop from '../models/Shop.js';
import Participation from '../models/Participation.js';
import PurchaseOrder from '../models/PurchaseOrder.js';



const MIN_RELIABILITY_SCORE_TO_CREATE_POOL = 50; // suppliers below this score are suspended from opening new pools
const COMMITMENT_FEE_RATE = 0.05; // 5% of the participation's own value, held as a refundable/forfeitable deposit

// @route   POST /api/pools
// @access  Private (admin or supplier)
export const createPool = async (req, res) => {
  try {
    const { productName, categoryId, deliveryZone, unitPrice, minQuantity, maxQuantity, expiryDate } = req.body;

    if (!productName || !categoryId || !deliveryZone || !unitPrice || !minQuantity || !maxQuantity || !expiryDate) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // an expiry date in the past would let a pool expire before anyone could ever join it
    if (new Date(expiryDate) <= new Date()) {
      return res.status(400).json({ message: 'expiryDate must be in the future' });
    }

    const category = await Category.findOne({ _id: categoryId, isActive: true });
    if (!category) {
      return res.status(400).json({ message: 'Invalid category id' });
    }

    // a supplier can only open pools under their own supplier profile
    // an admin must specify which supplier this pool is for
    let supplierId;
    if (req.user.role === 'supplier') {
      const supplier = await Supplier.findOne({ userId: req.user._id });
      if (!supplier) {
        return res.status(400).json({ message: 'You do not have a supplier profile yet' });
      }

      // enforces the risk-handling policy: repeated rejections lower this score,
      // and a supplier who has fallen too low is suspended from opening new pools
      if (supplier.reliabilityScore < MIN_RELIABILITY_SCORE_TO_CREATE_POOL) {
        return res.status(403).json({
          message: `Your reliability score (${supplier.reliabilityScore}) is too low to open new pools. Contact the platform admin.`,
        });
      }

      supplierId = supplier._id;
    } else if (req.user.role === 'admin') {
      if (!req.body.supplierId) {
        return res.status(400).json({ message: 'supplierId is required when an admin creates a pool' });
      }
      supplierId = req.body.supplierId;
    }

    const pool = await Pool.create({
      productName,
      categoryId,
      deliveryZone,
      supplierId,
      createdBy: req.user._id,
      unitPrice,
      minQuantity,
      maxQuantity,
      expiryDate,
    });

    res.status(201).json({ pool });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/pools
// @access  Private (any logged-in user)
// supports optional filters: ?categoryId=...&deliveryZone=...&status=OPEN
export const getPools = async (req, res) => {
  try {
    const filter = {};
    if (req.query.categoryId) filter.categoryId = req.query.categoryId;
    if (req.query.deliveryZone) filter.deliveryZone = req.query.deliveryZone;
    if (req.query.status) filter.status = req.query.status;

    const pools = await Pool.find(filter)
      .populate('categoryId')
      .populate('supplierId');

    res.status(200).json({ pools });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/pools/:id
// @access  Private (any logged-in user)
export const getPoolById = async (req, res) => {
  try {
    const pool = await Pool.findById(req.params.id)
      .populate('categoryId')
      .populate('supplierId');

    if (!pool) {
      return res.status(404).json({ message: 'Pool not found' });
    }

    res.status(200).json({ pool });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/pools/:id/join
// @access  Private (buyer only)
//
// HARDENING NOTE: wrapped in a MongoDB transaction. Without this, two shops joining
// at the exact same moment could both pass the "does this exceed maxQuantity" check
// before either save finishes, letting the pool exceed its hard cap. The transaction
// makes the capacity check and the quantity increment a single atomic operation:
// either both succeed together, or both fail together — never a partial state.
export const joinPool = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: 'A valid quantity is required' });
    }

    const shop = await Shop.findOne({ userId: req.user._id });
    if (!shop) {
      return res.status(400).json({ message: 'You need a shop profile before joining a pool' });
    }

    let resultParticipation;
    let resultPool;

    await session.withTransaction(async () => {
      const pool = await Pool.findById(req.params.id).session(session);
      if (!pool) {
        throw { httpStatus: 404, message: 'Pool not found' };
      }

      if (pool.status !== 'OPEN') {
        throw { httpStatus: 400, message: `Cannot join a pool with status ${pool.status}` };
      }

      if (new Date() > pool.expiryDate) {
        throw { httpStatus: 400, message: 'This pool has expired' };
      }

      const commitmentFeeAmount = Math.round(quantity * pool.unitPrice * COMMITMENT_FEE_RATE * 100) / 100;

      // create the participation inside the transaction — if the unique index (poolId+shopId)
      // rejects a duplicate join, the whole transaction rolls back automatically
      const created = await Participation.create(
        [
          {
            poolId: pool._id,
            shopId: shop._id,
            quantity,
            commitmentFeeAmount,
          },
        ],
        { session }
      );
      resultParticipation = created[0];

      // atomic guarded increment: only applies if the pool is still OPEN, not expired,
      // and the new total still fits within maxQuantity — all checked in the same
      // database operation as the increment itself, closing the race-condition window
      const updatedPool = await Pool.findOneAndUpdate(
        {
          _id: pool._id,
          status: 'OPEN',
          expiryDate: { $gt: new Date() },
          $expr: { $lte: [{ $add: ['$currentQuantity', quantity] }, '$maxQuantity'] },
        },
        { $inc: { currentQuantity: quantity } },
        { new: true, session }
      );

      if (!updatedPool) {
        throw {
          httpStatus: 400,
          message: 'This pool no longer has room for that quantity (it may have just filled up)',
        };
      }

      // once the minimum is reached, move to the supplier confirmation stage automatically
      if (updatedPool.currentQuantity >= updatedPool.minQuantity && updatedPool.status === 'OPEN') {
        updatedPool.status = 'PENDING_SUPPLIER_CONFIRMATION';
        await updatedPool.save({ session });
      }

      resultPool = updatedPool;
    });

    res.status(201).json({ participation: resultParticipation, pool: resultPool });
  } catch (error) {
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ message: error.message });
    }
    if (error.code === 11000) {
      return res.status(400).json({ message: 'This shop has already joined this pool' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// @route   DELETE /api/pools/:id/leave
// @access  Private (buyer only)
// the shop withdraws before the pool completes — their commitment fee is forfeited (kept), not refunded
export const leavePool = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const shop = await Shop.findOne({ userId: req.user._id });
    if (!shop) {
      return res.status(400).json({ message: 'Shop profile not found' });
    }

    let resultPool;

    await session.withTransaction(async () => {
      const pool = await Pool.findById(req.params.id).session(session);
      if (!pool) {
        throw { httpStatus: 404, message: 'Pool not found' };
      }

      if (pool.status !== 'OPEN' && pool.status !== 'PENDING_SUPPLIER_CONFIRMATION') {
        throw { httpStatus: 400, message: `Cannot leave a pool with status ${pool.status}` };
      }

      const participation = await Participation.findOne({
        poolId: pool._id,
        shopId: shop._id,
        status: 'ACTIVE',
      }).session(session);

      if (!participation) {
        throw { httpStatus: 404, message: 'Active participation not found for this shop in this pool' };
      }

      participation.status = 'CANCELLED';
      participation.commitmentFeeStatus = 'FORFEITED'; // shop withdrew voluntarily, so the fee is kept
      await participation.save({ session });

      pool.currentQuantity -= participation.quantity;
      if (pool.status === 'PENDING_SUPPLIER_CONFIRMATION' && pool.currentQuantity < pool.minQuantity) {
        pool.status = 'OPEN'; // drop back below threshold, reopen the pool
      }
      await pool.save({ session });

      resultPool = pool;
    });

    res.status(200).json({ message: 'Participation cancelled, commitment fee forfeited', pool: resultPool });
  } catch (error) {
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// @route   POST /api/pools/:id/confirm
// @access  Private (supplier who owns this pool, or admin)
// the supplier confirms the final quantity/price after the pool hit its minimum — this generates the PurchaseOrder
export const confirmPool = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    let resultPurchaseOrder;
    let resultPool;

    await session.withTransaction(async () => {
      const pool = await Pool.findById(req.params.id).session(session);
      if (!pool) {
        throw { httpStatus: 404, message: 'Pool not found' };
      }

      if (pool.status !== 'PENDING_SUPPLIER_CONFIRMATION') {
        throw { httpStatus: 400, message: `Cannot confirm a pool with status ${pool.status}` };
      }

      if (req.user.role === 'supplier') {
        const supplier = await Supplier.findOne({ userId: req.user._id }).session(session);
        if (!supplier || String(supplier._id) !== String(pool.supplierId)) {
          throw { httpStatus: 403, message: 'You do not own this pool' };
        }
      }

      const totalQuantity = pool.currentQuantity;
      const totalAmount = totalQuantity * pool.unitPrice;
      const { supplierCommission, buyersCommission } = PurchaseOrder.calculateCommissions(totalAmount);

      const created = await PurchaseOrder.create(
        [
          {
            poolId: pool._id,
            totalQuantity,
            totalAmount,
            supplierCommission,
            buyersCommission,
            status: 'CONFIRMED',
            confirmedAt: new Date(),
          },
        ],
        { session }
      );
      resultPurchaseOrder = created[0];

      pool.status = 'COMPLETED';
      await pool.save({ session });
      resultPool = pool;
    });

    res.status(200).json({ purchaseOrder: resultPurchaseOrder, pool: resultPool });
  } catch (error) {
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// @route   POST /api/pools/:id/reject
// @access  Private (supplier who owns this pool, or admin)
// the supplier rejects the pool after it hit its minimum — every shop is refunded in full, no commission is charged,
// and the supplier's reliability score drops (see the risk-handling policy)
export const rejectPool = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    let resultPool;

    await session.withTransaction(async () => {
      const pool = await Pool.findById(req.params.id).session(session);
      if (!pool) {
        throw { httpStatus: 404, message: 'Pool not found' };
      }

      if (pool.status !== 'PENDING_SUPPLIER_CONFIRMATION') {
        throw { httpStatus: 400, message: `Cannot reject a pool with status ${pool.status}` };
      }

      const supplier = await Supplier.findById(pool.supplierId).session(session);

      if (req.user.role === 'supplier') {
        const requestingSupplier = await Supplier.findOne({ userId: req.user._id }).session(session);
        if (!requestingSupplier || String(requestingSupplier._id) !== String(pool.supplierId)) {
          throw { httpStatus: 403, message: 'You do not own this pool' };
        }
      }

      // full refund for every shop currently in the pool — the supplier is at fault, not the shops
      await Participation.updateMany(
        { poolId: pool._id, status: 'ACTIVE' },
        { commitmentFeeStatus: 'REFUNDED' },
        { session }
      );

      // record the rejected order for history, with zero commission (no completed sale happened)
      await PurchaseOrder.create(
        [
          {
            poolId: pool._id,
            totalQuantity: pool.currentQuantity,
            totalAmount: pool.currentQuantity * pool.unitPrice,
            supplierCommission: 0,
            buyersCommission: 0,
            status: 'REJECTED',
          },
        ],
        { session }
      );

      pool.status = 'CANCELLED';
      await pool.save({ session });

      if (supplier) {
        supplier.rejectionCount += 1;
        supplier.reliabilityScore = Math.max(0, supplier.reliabilityScore - 10);
        await supplier.save({ session });
      }

      resultPool = pool;
    });

    res.status(200).json({
      message: 'Pool rejected. All commitment fees have been refunded.',
      pool: resultPool,
    });
  } catch (error) {
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// @route   POST /api/pools/:id/cancel
// @access  Private (supplier who owns this pool, or admin)
// voluntary cancellation of a pool that hasn't completed yet (still OPEN, hasn't hit its minimum).
// unlike rejectPool (which happens after the minimum is reached), this covers the supplier or
// admin simply deciding to stop a pool early — every active participant is refunded in full,
// since none of them did anything wrong.
export const cancelPool = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    let resultPool;

    await session.withTransaction(async () => {
      const pool = await Pool.findById(req.params.id).session(session);
      if (!pool) {
        throw { httpStatus: 404, message: 'Pool not found' };
      }

      if (pool.status !== 'OPEN') {
        throw {
          httpStatus: 400,
          message: `Cannot cancel a pool with status ${pool.status}. Use /reject after it reaches its minimum instead.`,
        };
      }

      if (req.user.role === 'supplier') {
        const supplier = await Supplier.findOne({ userId: req.user._id }).session(session);
        if (!supplier || String(supplier._id) !== String(pool.supplierId)) {
          throw { httpStatus: 403, message: 'You do not own this pool' };
        }
      }

      // refund every shop currently in the pool — cancelling was the supplier's/admin's choice, not theirs
      await Participation.updateMany(
        { poolId: pool._id, status: 'ACTIVE' },
        { commitmentFeeStatus: 'REFUNDED' },
        { session }
      );

      pool.status = 'CANCELLED';
      await pool.save({ session });

      resultPool = pool;
    });

    res.status(200).json({
      message: 'Pool cancelled. All commitment fees have been refunded.',
      pool: resultPool,
    });
  } catch (error) {
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};


// @route   GET /api/pools/:id/participants
// @access  Private (admin, or the supplier who owns this pool)
// lists every shop currently or previously in this pool — needed for the pool detail
// page (who joined, how much, whether their commitment fee was paid/refunded/forfeited)
export const getPoolParticipants = async (req, res) => {
  try {
    const pool = await Pool.findById(req.params.id);
    if (!pool) {
      return res.status(404).json({ message: 'Pool not found' });
    }

    if (req.user.role === 'supplier') {
      const supplier = await Supplier.findOne({ userId: req.user._id });
      if (!supplier || String(supplier._id) !== String(pool.supplierId)) {
        return res.status(403).json({ message: 'You do not own this pool' });
      }
    }

    const participants = await Participation.find({ poolId: pool._id })
      .populate({
        path: 'shopId',
        select: 'shopName deliveryZone userId',
        populate: { path: 'userId', select: 'name phone' },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({ participants });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @route   PUT /api/pools/:id
// @access  Private (supplier who owns this pool, or admin)
// only allowed while the pool is still OPEN — once shops have joined and it moves past
// that stage, changing price/quantity retroactively would be unfair to whoever already
// committed under the original terms.
export const updatePool = async (req, res) => {
  try {
    const pool = await Pool.findById(req.params.id);
    if (!pool) {
      return res.status(404).json({ message: 'Pool not found' });
    }

    if (pool.status !== 'OPEN') {
      return res.status(400).json({
        message: `Cannot edit a pool with status ${pool.status}. Only OPEN pools can be edited.`,
      });
    }

    if (req.user.role === 'supplier') {
      const supplier = await Supplier.findOne({ userId: req.user._id });
      if (!supplier || String(supplier._id) !== String(pool.supplierId)) {
        return res.status(403).json({ message: 'You do not own this pool' });
      }
    }

    const { productName, unitPrice, minQuantity, maxQuantity, deliveryZone, expiryDate } = req.body;

    if (maxQuantity !== undefined && maxQuantity < pool.currentQuantity) {
      return res.status(400).json({
        message: `maxQuantity cannot be lower than the current committed quantity (${pool.currentQuantity})`,
      });
    }
    if (minQuantity !== undefined && maxQuantity === undefined && minQuantity > pool.maxQuantity) {
      return res.status(400).json({ message: 'minQuantity cannot exceed maxQuantity' });
    }
    if (expiryDate !== undefined && new Date(expiryDate) <= new Date()) {
      return res.status(400).json({ message: 'expiryDate must be in the future' });
    }

    if (productName !== undefined) pool.productName = productName;
    if (unitPrice !== undefined) pool.unitPrice = unitPrice;
    if (minQuantity !== undefined) pool.minQuantity = minQuantity;
    if (maxQuantity !== undefined) pool.maxQuantity = maxQuantity;
    if (deliveryZone !== undefined) pool.deliveryZone = deliveryZone;
    if (expiryDate !== undefined) pool.expiryDate = expiryDate;

    await pool.save();

    res.status(200).json({ pool });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};