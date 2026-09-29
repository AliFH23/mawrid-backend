import mongoose from 'mongoose';
import Pool from '../../models/Pool.js';
import Transaction from '../../models/Transaction.js';
import Fine from '../../models/Fine.js';
import Supplier from '../../models/Supplier.js';
import Category from '../../models/Category.js';
import DeliveryZone from '../../models/DeliveryZone.js';
import Shop from '../../models/Shop.js';
import Participation from '../../models/Participation.js';
import PurchaseOrder from '../../models/PurchaseOrder.js';
import PlatformSettings from '../../models/PlatformSettings.js';

const MIN_RELIABILITY_SCORE_TO_CREATE_POOL = 50;
const RELIABILITY_PENALTY_PER_REJECTION = 10;

// @route   POST /api/pools
// @access  Private (admin or supplier)
export const createPool = async (req, res) => {
  try {
    const { productName, description, categoryIds, deliveryZone, unitPrice, minQuantity, maxQuantity, expiryDate } = req.body;

    if (!productName || !categoryIds || !categoryIds.length || !deliveryZone || !unitPrice || !minQuantity || !maxQuantity || !expiryDate) {
      return res.status(400).json({ message: 'All fields are required (including at least one category)' });
    }

    if (new Date(expiryDate) <= new Date()) {
      return res.status(400).json({ message: 'expiryDate must be in the future' });
    }

    const validCategories = await Category.find({ _id: { $in: categoryIds }, isActive: true });
    if (validCategories.length !== categoryIds.length) {
      return res.status(400).json({ message: 'One or more category ids are invalid' });
    }

    const zone = await DeliveryZone.findOne({ _id: deliveryZone, isActive: true });
    if (!zone) {
      return res.status(400).json({ message: 'Invalid delivery zone id' });
    }

    let supplierId;
    if (req.user.role === 'supplier') {
      const supplier = await Supplier.findOne({ userId: req.user._id });
      if (!supplier) {
        return res.status(400).json({ message: 'You do not have a supplier profile yet' });
      }

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
      description,
      categoryIds,
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
export const getPools = async (req, res) => {
  try {
    const filter = {};
    if (req.query.categoryId) filter.categoryIds = req.query.categoryId;
    if (req.query.deliveryZone) filter.deliveryZone = req.query.deliveryZone;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.supplierId) filter.supplierId = req.query.supplierId;

    const pools = await Pool.find(filter)
      .populate('categoryIds')
      .populate('deliveryZone')
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
      .populate('categoryIds')
      .populate('deliveryZone')
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
export const joinPool = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { quantity, paymentMethod } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ message: 'A valid quantity is required' });
    }

    const shop = await Shop.findOne({ userId: req.user._id });
    if (!shop) {
      return res.status(400).json({ message: 'You need a shop profile before joining a pool' });
    }

    const settings = await PlatformSettings.getSingleton();

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

      const maxAllowedForOneShop = Math.max(1, Math.floor(pool.minQuantity * settings.maxSharePerShop));
      if (quantity > maxAllowedForOneShop) {
        throw {
          httpStatus: 400,
          message: `للحفاظ على مبدأ التجميع بين عدة محلات، أقصى كمية مسموحة لمحل واحد بهالسلة هي ${maxAllowedForOneShop} قطعة (${Math.round(settings.maxSharePerShop * 100)}% من الحد الأدنى). استني المورد يرفع الحد الأدنى، أو قلّلي طلبك.`,
        };
      }

      const commitmentFeeAmount = Math.round(quantity * pool.unitPrice * settings.commitmentFeeRate * 100) / 100;

      const created = await Participation.create(
        [
          {
            poolId: pool._id,
            shopId: shop._id,
            quantity,
            commitmentFeeAmount,
            paymentMethod: paymentMethod || 'CARD',
          },
        ],
        { session }
      );
      resultParticipation = created[0];

      await Transaction.create(
        [
          {
            type: 'COMMITMENT_FEE_PAID',
            amount: commitmentFeeAmount,
            poolId: pool._id,
            shopId: shop._id,
            description: `رسم التزام (${Math.round(settings.commitmentFeeRate * 100)}%) — انضمام محل بكمية ${quantity} لسلة "${pool.productName}"`,
          },
        ],
        { session }
      );

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
        const freshPool = await Pool.findById(pool._id).session(session);
        const remaining = Math.max(0, freshPool.maxQuantity - freshPool.currentQuantity);
        throw {
          httpStatus: 400,
          message:
            remaining > 0
              ? `الكمية المتبقية بهالسلة ${remaining} قطعة بس — قلّلي طلبك، أو استني المورد يرفع الحد الأقصى.`
              : 'هالسلة وصلت للحد الأقصى بالكامل — استني المورد يرفع الحد الأقصى قبل ما تحاولي تنضمي.',
        };
      }

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

// @route   PUT /api/pools/:id/increase-participation
// @access  Private (buyer only)
// lets a shop that already joined add MORE quantity to their existing commitment —
// closes the loop with increaseMinQuantity: raising the minimum only helps a shop
// that genuinely wants more if that shop can actually act on it afterward. Only
// works while the pool is still OPEN, and pays an additional commitment fee
// proportional to just the added quantity.
export const increaseParticipation = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { additionalQuantity, paymentMethod } = req.body;

    if (!additionalQuantity || additionalQuantity < 1) {
      return res.status(400).json({ message: 'A valid additionalQuantity is required' });
    }

    const shop = await Shop.findOne({ userId: req.user._id });
    if (!shop) {
      return res.status(400).json({ message: 'No shop found for this user' });
    }

    const settings = await PlatformSettings.getSingleton();

    let resultParticipation;
    let resultPool;

    await session.withTransaction(async () => {
      const pool = await Pool.findById(req.params.id).session(session);
      if (!pool) {
        throw { httpStatus: 404, message: 'Pool not found' };
      }

      if (pool.status !== 'OPEN') {
        throw { httpStatus: 400, message: `Cannot increase quantity on a pool with status ${pool.status}` };
      }

      if (new Date() > pool.expiryDate) {
        throw { httpStatus: 400, message: 'This pool has expired' };
      }

      const participation = await Participation.findOne({
        poolId: pool._id,
        shopId: shop._id,
        status: 'ACTIVE',
      }).session(session);

      if (!participation) {
        throw { httpStatus: 404, message: 'You have not joined this pool yet' };
      }

      const newTotalQuantity = participation.quantity + additionalQuantity;
      const maxAllowedForOneShop = Math.max(1, Math.floor(pool.minQuantity * settings.maxSharePerShop));
      if (newTotalQuantity > maxAllowedForOneShop) {
        throw {
          httpStatus: 400,
          message: `أقصى كمية مسموحة لمحلك بهالسلة ${maxAllowedForOneShop} قطعة — عندك أصلًا ${participation.quantity}، فأقصى إضافة ممكنة هلق ${Math.max(0, maxAllowedForOneShop - participation.quantity)} قطعة.`,
        };
      }

      const additionalFee = Math.round(additionalQuantity * pool.unitPrice * settings.commitmentFeeRate * 100) / 100;

      participation.quantity = newTotalQuantity;
      participation.commitmentFeeAmount += additionalFee;
      if (paymentMethod) participation.paymentMethod = paymentMethod;
      await participation.save({ session });
      resultParticipation = participation;

      await Transaction.create(
        [
          {
            type: 'COMMITMENT_FEE_PAID',
            amount: additionalFee,
            poolId: pool._id,
            shopId: shop._id,
            description: `رسم التزام إضافي (${Math.round(settings.commitmentFeeRate * 100)}%) — زيادة كمية محل بـ${additionalQuantity} قطعة لسلة "${pool.productName}"`,
          },
        ],
        { session }
      );

      const updatedPool = await Pool.findOneAndUpdate(
        {
          _id: pool._id,
          status: 'OPEN',
          expiryDate: { $gt: new Date() },
          $expr: { $lte: [{ $add: ['$currentQuantity', additionalQuantity] }, '$maxQuantity'] },
        },
        { $inc: { currentQuantity: additionalQuantity } },
        { new: true, session }
      );

      if (!updatedPool) {
        const freshPool = await Pool.findById(pool._id).session(session);
        const remaining = Math.max(0, freshPool.maxQuantity - freshPool.currentQuantity);
        throw {
          httpStatus: 400,
          message:
            remaining > 0
              ? `ما في مكان كافي بالسلة لهالإضافة — الكمية المتبقية ${remaining} قطعة بس.`
              : 'السلة وصلت للحد الأقصى بالكامل.',
        };
      }

      if (updatedPool.currentQuantity >= updatedPool.minQuantity && updatedPool.status === 'OPEN') {
        updatedPool.status = 'PENDING_SUPPLIER_CONFIRMATION';
        await updatedPool.save({ session });
      }

      resultPool = updatedPool;
    });

    res.status(200).json({ participation: resultParticipation, pool: resultPool });
  } catch (error) {
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  } finally {
    session.endSession();
  }
};

// @route   DELETE /api/pools/:id/leave
// @access  Private (buyer only)
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
      participation.commitmentFeeStatus = 'FORFEITED';
      await participation.save({ session });

      await Transaction.create(
        [
          {
            type: 'COMMITMENT_FEE_FORFEITED',
            amount: participation.commitmentFeeAmount,
            poolId: pool._id,
            shopId: shop._id,
            description: `مصادرة رسم التزام — المحل انسحب طوعيًا من سلة "${pool.productName}"`,
          },
        ],
        { session }
      );

      pool.currentQuantity -= participation.quantity;
      if (pool.status === 'PENDING_SUPPLIER_CONFIRMATION' && pool.currentQuantity < pool.minQuantity) {
        pool.status = 'OPEN';
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
export const confirmPool = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const settings = await PlatformSettings.getSingleton();
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
      const supplierCommission = Math.round(totalAmount * settings.supplierCommissionRate * 100) / 100;
      const buyersCommission = Math.round(totalAmount * settings.buyerCommissionRate * 100) / 100;

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

      await Transaction.create(
        [
          {
            type: 'SUPPLIER_COMMISSION',
            amount: supplierCommission,
            poolId: pool._id,
            supplierId: pool.supplierId,
            description: `عمولة المنصة من المورد (${Math.round(settings.supplierCommissionRate * 100)}%) — سلة "${pool.productName}"`,
          },
          {
            type: 'BUYER_COMMISSION',
            amount: buyersCommission,
            poolId: pool._id,
            description: `عمولة المنصة من المحلات (${Math.round(settings.buyerCommissionRate * 100)}%) — سلة "${pool.productName}"`,
          },
        ],
        { session, ordered: true }
      );
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
export const rejectPool = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'A rejection reason is required' });
    }

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

      const activeParticipations = await Participation.find({ poolId: pool._id, status: 'ACTIVE' }).session(session);

      await Participation.updateMany(
        { poolId: pool._id, status: 'ACTIVE' },
        { commitmentFeeStatus: 'REFUNDED' },
        { session }
      );

      await Transaction.create(
        activeParticipations.map((p) => ({
          type: 'COMMITMENT_FEE_REFUNDED',
          amount: p.commitmentFeeAmount,
          poolId: pool._id,
          shopId: p.shopId,
          description: `استرداد رسم التزام — المورد رفض سلة "${pool.productName}" (السبب: ${reason.trim()})`,
        })),
        { session, ordered: true }
      );

      await PurchaseOrder.create(
        [
          {
            poolId: pool._id,
            totalQuantity: pool.currentQuantity,
            totalAmount: pool.currentQuantity * pool.unitPrice,
            supplierCommission: 0,
            buyersCommission: 0,
            status: 'REJECTED',
            rejectionReason: reason.trim(),
          },
        ],
        { session }
      );

      pool.status = 'CANCELLED';
      await pool.save({ session });

      if (supplier) {
        supplier.rejectionCount += 1;
        supplier.reliabilityScore = Math.max(0, supplier.reliabilityScore - RELIABILITY_PENALTY_PER_REJECTION);
        await supplier.save({ session });

        await Fine.create(
          [
            {
              supplierId: supplier._id,
              poolId: pool._id,
              reason: `رفض سلة "${pool.productName}" بعد وصولها للحد الأدنى — سبب المورد: ${reason.trim()}`,
              reliabilityScorePenalty: RELIABILITY_PENALTY_PER_REJECTION,
            },
          ],
          { session }
        );
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

      const activeParticipations = await Participation.find({ poolId: pool._id, status: 'ACTIVE' }).session(session);

      await Participation.updateMany(
        { poolId: pool._id, status: 'ACTIVE' },
        { commitmentFeeStatus: 'REFUNDED' },
        { session }
      );

      await Transaction.create(
        activeParticipations.map((p) => ({
          type: 'COMMITMENT_FEE_REFUNDED',
          amount: p.commitmentFeeAmount,
          poolId: pool._id,
          shopId: p.shopId,
          description: `استرداد رسم التزام — المورد ألغى سلة "${pool.productName}"`,
        })),
        { session, ordered: true }
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

    const { productName, description, categoryIds, unitPrice, minQuantity, maxQuantity, deliveryZone, expiryDate } = req.body;

    if (categoryIds !== undefined) {
      if (!categoryIds.length) {
        return res.status(400).json({ message: 'At least one category is required' });
      }
      const validCategories = await Category.find({ _id: { $in: categoryIds }, isActive: true });
      if (validCategories.length !== categoryIds.length) {
        return res.status(400).json({ message: 'One or more category ids are invalid' });
      }
    }

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
    if (deliveryZone !== undefined) {
      const zone = await DeliveryZone.findOne({ _id: deliveryZone, isActive: true });
      if (!zone) {
        return res.status(400).json({ message: 'Invalid delivery zone id' });
      }
    }

    if (productName !== undefined) pool.productName = productName;
    if (description !== undefined) pool.description = description;
    if (categoryIds !== undefined) pool.categoryIds = categoryIds;
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

// @route   PUT /api/pools/:id/extend
// @access  Private (supplier who owns this pool, or admin)
export const extendPool = async (req, res) => {
  try {
    const pool = await Pool.findById(req.params.id);
    if (!pool) {
      return res.status(404).json({ message: 'Pool not found' });
    }

    if (pool.status !== 'OPEN') {
      return res.status(400).json({
        message: `Cannot extend a pool with status ${pool.status}. Only OPEN pools can be extended.`,
      });
    }

    if (req.user.role === 'supplier') {
      const supplier = await Supplier.findOne({ userId: req.user._id });
      if (!supplier || String(supplier._id) !== String(pool.supplierId)) {
        return res.status(403).json({ message: 'You do not own this pool' });
      }
    }

    const { newExpiryDate } = req.body;
    if (!newExpiryDate) {
      return res.status(400).json({ message: 'newExpiryDate is required' });
    }

    const parsedDate = new Date(newExpiryDate);
    if (parsedDate <= new Date()) {
      return res.status(400).json({ message: 'newExpiryDate must be in the future' });
    }
    if (parsedDate <= pool.expiryDate) {
      return res.status(400).json({ message: 'newExpiryDate must be later than the current expiry date' });
    }

    pool.expiryDate = parsedDate;
    pool.extended = true;
    await pool.save();

    res.status(200).json({ pool });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/pools/:id/increase-max
// @access  Private (supplier who owns this pool, or admin)
export const increaseMaxQuantity = async (req, res) => {
  try {
    const pool = await Pool.findById(req.params.id);
    if (!pool) {
      return res.status(404).json({ message: 'Pool not found' });
    }

    if (pool.status !== 'OPEN') {
      return res.status(400).json({
        message: `Cannot increase the max quantity of a pool with status ${pool.status}. Only OPEN pools can be adjusted.`,
      });
    }

    if (req.user.role === 'supplier') {
      const supplier = await Supplier.findOne({ userId: req.user._id });
      if (!supplier || String(supplier._id) !== String(pool.supplierId)) {
        return res.status(403).json({ message: 'You do not own this pool' });
      }
    }

    const { newMaxQuantity } = req.body;
    if (!newMaxQuantity) {
      return res.status(400).json({ message: 'newMaxQuantity is required' });
    }
    if (newMaxQuantity <= pool.maxQuantity) {
      return res.status(400).json({ message: 'newMaxQuantity must be greater than the current maxQuantity' });
    }

    pool.maxQuantity = newMaxQuantity;
    await pool.save();

    res.status(200).json({ pool });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/pools/:id/increase-min
// @access  Private (supplier who owns this pool, or admin)
export const increaseMinQuantity = async (req, res) => {
  try {
    const pool = await Pool.findById(req.params.id);
    if (!pool) {
      return res.status(404).json({ message: 'Pool not found' });
    }

    if (pool.status !== 'OPEN') {
      return res.status(400).json({
        message: `Cannot increase the minimum quantity of a pool with status ${pool.status}. Only OPEN pools can be adjusted.`,
      });
    }

    if (req.user.role === 'supplier') {
      const supplier = await Supplier.findOne({ userId: req.user._id });
      if (!supplier || String(supplier._id) !== String(pool.supplierId)) {
        return res.status(403).json({ message: 'You do not own this pool' });
      }
    }

    const { newMinQuantity } = req.body;
    if (!newMinQuantity) {
      return res.status(400).json({ message: 'newMinQuantity is required' });
    }
    if (newMinQuantity <= pool.minQuantity) {
      return res.status(400).json({ message: 'newMinQuantity must be greater than the current minQuantity' });
    }
    if (newMinQuantity > pool.maxQuantity) {
      return res.status(400).json({ message: 'newMinQuantity cannot exceed maxQuantity' });
    }

    pool.minQuantity = newMinQuantity;
    await pool.save();

    res.status(200).json({ pool });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};