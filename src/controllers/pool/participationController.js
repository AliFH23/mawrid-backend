import mongoose from 'mongoose';
import Participation from '../../models/Participation.js';
import Shop from '../../models/Shop.js';
import Pool from '../../models/Pool.js';
import Transaction from '../../models/Transaction.js';
import PlatformSettings from '../../models/PlatformSettings.js';
import Supplier from '../../models/Supplier.js';
import { getShopsReliability } from '../../utils/shopReliability.js';

// loyalty tiers — based on a shop's total historical PAID quantity across every
// completed order ever (not just this pool). The more a shop keeps growing its
// orders over time, the bigger the discount on its next final payment.
const LOYALTY_TIERS = [
  { minQuantity: 500, discountRate: 0.08 },
  { minQuantity: 150, discountRate: 0.05 },
  { minQuantity: 50, discountRate: 0.02 },
  { minQuantity: 0, discountRate: 0 },
];

// cashback is only for digital payment methods — cash gets none, by design, since
// the point is to nudge people toward the app's payment rails instead of cash
const CASHBACK_RATE = 0.01;

const getLoyaltyInfo = async (shopId, excludeParticipationId) => {
  const result = await Participation.aggregate([
    {
      $match: {
        shopId: new mongoose.Types.ObjectId(shopId),
        finalPaymentStatus: 'PAID',
        _id: { $ne: new mongoose.Types.ObjectId(excludeParticipationId) },
      },
    },
    { $group: { _id: null, total: { $sum: '$quantity' } } },
  ]);
  const historicalQuantity = result[0]?.total || 0;
  const tier = LOYALTY_TIERS.find((t) => historicalQuantity >= t.minQuantity);
  return { historicalQuantity, discountRate: tier.discountRate };
};

// shared by both the preview endpoint and the actual payment, so the number shown
// to the buyer before paying is always exactly what gets charged
const computeBalanceBreakdown = async (participation, pool) => {
  const settings = await PlatformSettings.getSingleton();
  const baseAmount = participation.quantity * pool.unitPrice;

  const { discountRate: loyaltyRate, historicalQuantity } = await getLoyaltyInfo(participation.shopId, participation._id);
  const loyaltyDiscountAmount = Math.round(baseAmount * loyaltyRate * 100) / 100;

  const buyerCommission = Math.round(baseAmount * settings.buyerCommissionRate * 100) / 100;

  const totalBalance =
    baseAmount - participation.commitmentFeeAmount + buyerCommission - loyaltyDiscountAmount;

  const isCashbackEligible = participation.paymentMethod !== 'CASH';
  const cashbackAmount = isCashbackEligible ? Math.round(totalBalance * CASHBACK_RATE * 100) / 100 : 0;

  return {
    baseAmount,
    commitmentFeeAmount: participation.commitmentFeeAmount,
    buyerCommissionRate: settings.buyerCommissionRate,
    buyerCommission,
    loyaltyDiscountRate: loyaltyRate,
    loyaltyDiscountAmount,
    historicalQuantity,
    totalBalance: Math.round(totalBalance * 100) / 100,
    cashbackRate: isCashbackEligible ? CASHBACK_RATE : 0,
    cashbackAmount,
  };
};

// @route   GET /api/participations/me
// @access  Private (buyer only)
export const getMyParticipations = async (req, res) => {
  try {
    const shop = await Shop.findOne({ userId: req.user._id });
    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user' });
    }

    const participations = await Participation.find({ shopId: shop._id })
      .populate('poolId')
      .sort({ createdAt: -1 });

    res.status(200).json({ participations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/participations/me/reliability
// @access  Private (buyer only)
export const getMyReliability = async (req, res) => {
  try {
    const shop = await Shop.findOne({ userId: req.user._id });
    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user' });
    }

    const map = await getShopsReliability([shop._id]);
    res.status(200).json({ reliability: map.get(String(shop._id)) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/participations/me/savings
// @access  Private (buyer only)
// how much cheaper the shop's group-buys were than the regular market price.
// "realized" = pools the supplier confirmed; "pending" = pools still open/waiting.
// (loyalty discount and cashback are not counted — this is just the pool price vs market.)
export const getMySavings = async (req, res) => {
  try {
    const shop = await Shop.findOne({ userId: req.user._id });
    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user' });
    }

    const participations = await Participation.find({ shopId: shop._id, status: 'ACTIVE' }).populate(
      'poolId',
      'unitPrice marketPrice status'
    );

    let realized = 0;
    let pending = 0;
    let realizedPools = 0;

    participations.forEach((p) => {
      const pool = p.poolId;
      if (!pool || !pool.marketPrice || pool.marketPrice <= pool.unitPrice) return;
      const saving = (pool.marketPrice - pool.unitPrice) * p.quantity;
      if (pool.status === 'COMPLETED') {
        realized += saving;
        realizedPools += 1;
      } else if (pool.status === 'OPEN' || pool.status === 'PENDING_SUPPLIER_CONFIRMATION') {
        pending += saving;
      }
    });

    res.status(200).json({
      savings: {
        realized: Math.round(realized * 100) / 100,
        pending: Math.round(pending * 100) / 100,
        realizedPools,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/participations/:id/balance-preview
// @access  Private (buyer only)
// lets the frontend show the EXACT amount before the buyer commits to paying —
// including loyalty discount and expected cashback, both of which depend on data
// (payment history) the frontend has no way to compute itself
export const getBalancePreview = async (req, res) => {
  try {
    const shop = await Shop.findOne({ userId: req.user._id });
    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user' });
    }

    const participation = await Participation.findById(req.params.id);
    if (!participation || String(participation.shopId) !== String(shop._id)) {
      return res.status(404).json({ message: 'Participation not found' });
    }

    const pool = await Pool.findById(participation.poolId);
    if (!pool) {
      return res.status(404).json({ message: 'Pool not found' });
    }

    const breakdown = await computeBalanceBreakdown(participation, pool);
    res.status(200).json({ breakdown });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/participations/:id/pay-balance
// @access  Private (buyer only)
export const payRemainingBalance = async (req, res) => {
  try {
    const shop = await Shop.findOne({ userId: req.user._id });
    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user' });
    }

    const participation = await Participation.findById(req.params.id);
    if (!participation) {
      return res.status(404).json({ message: 'Participation not found' });
    }

    if (String(participation.shopId) !== String(shop._id)) {
      return res.status(403).json({ message: 'This participation does not belong to your shop' });
    }

    if (participation.paymentMethod === 'CASH') {
      return res.status(400).json({ message: 'Cash on delivery is settled at receipt confirmation, not paid online' });
    }

    if (participation.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Cannot pay for a cancelled participation' });
    }

    if (participation.finalPaymentStatus === 'PAID') {
      return res.status(400).json({ message: 'The remaining balance has already been paid' });
    }

    const pool = await Pool.findById(participation.poolId);
    if (!pool || pool.status !== 'COMPLETED') {
      return res.status(400).json({
        message: 'Cannot pay the remaining balance until the supplier has confirmed and completed this pool',
      });
    }

    const breakdown = await computeBalanceBreakdown(participation, pool);

    participation.finalPaymentStatus = 'PAID';
    await participation.save();

    await Transaction.create({
      type: 'FINAL_PAYMENT',
      amount: breakdown.totalBalance,
      poolId: pool._id,
      shopId: shop._id,
      description: `دفع المبلغ المتبقي (عمولة منصة ${Math.round(breakdown.buyerCommissionRate * 100)}%${breakdown.loyaltyDiscountAmount > 0 ? `، خصم ولاء ${Math.round(breakdown.loyaltyDiscountRate * 100)}%: -${breakdown.loyaltyDiscountAmount.toFixed(2)} د.أ` : ''}) — سلة "${pool.productName}"`,
    });

    if (breakdown.cashbackAmount > 0) {
      shop.cashbackBalance = (shop.cashbackBalance || 0) + breakdown.cashbackAmount;
      await shop.save();

      await Transaction.create({
        type: 'CASHBACK_EARNED',
        amount: breakdown.cashbackAmount,
        poolId: pool._id,
        shopId: shop._id,
        description: `كاش باك (1%) عن دفع رقمي — سلة "${pool.productName}"`,
      });
    }

    res.status(200).json({ message: 'Remaining balance paid', participation, breakdown });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/participations/:id/confirm-receipt
// @access  Private (buyer only)
export const confirmReceipt = async (req, res) => {
  try {
    const shop = await Shop.findOne({ userId: req.user._id });
    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user' });
    }

    const participation = await Participation.findById(req.params.id);
    if (!participation) {
      return res.status(404).json({ message: 'Participation not found' });
    }

    if (String(participation.shopId) !== String(shop._id)) {
      return res.status(403).json({ message: 'This participation does not belong to your shop' });
    }

    if (participation.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Cannot confirm receipt for a cancelled participation' });
    }

    if (participation.deliveryStatus === 'DELIVERED') {
      return res.status(400).json({ message: 'Receipt has already been confirmed for this participation' });
    }

    // a shop can only confirm receipt of something the supplier actually shipped
    if (participation.deliveryStatus !== 'OUT_FOR_DELIVERY') {
      return res.status(400).json({ message: 'Please wait until the supplier marks this order as shipped' });
    }

    if (participation.paymentMethod !== 'CASH' && participation.finalPaymentStatus !== 'PAID') {
      return res.status(400).json({ message: 'Please pay the remaining balance before confirming receipt' });
    }

    const pool = await Pool.findById(participation.poolId);
    if (!pool || pool.status !== 'COMPLETED') {
      return res.status(400).json({
        message: 'Cannot confirm receipt until the supplier has confirmed and completed this pool',
      });
    }

    participation.deliveryStatus = 'DELIVERED';
    participation.deliveredAt = new Date();

    if (participation.paymentMethod === 'CASH') {
      const breakdown = await computeBalanceBreakdown(participation, pool);
      participation.finalPaymentStatus = 'PAID';

      await Transaction.create({
        type: 'FINAL_PAYMENT',
        amount: breakdown.totalBalance,
        poolId: pool._id,
        shopId: shop._id,
        description: `دفع نقدي عند الاستلام (عمولة منصة ${Math.round(breakdown.buyerCommissionRate * 100)}%${breakdown.loyaltyDiscountAmount > 0 ? `، خصم ولاء ${Math.round(breakdown.loyaltyDiscountRate * 100)}%: -${breakdown.loyaltyDiscountAmount.toFixed(2)} د.أ` : ''}) — سلة "${pool.productName}"`,
      });
      // no cashback for cash payments — by design
    }

    await participation.save();

    res.status(200).json({ message: 'Receipt confirmed', participation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ─── supplier-side delivery tracking ───

// a non-cash order can only be shipped once the shop paid the remaining balance
// (cash is settled at the door, so it is always shippable)
const isShippable = (participation) =>
  participation.status === 'ACTIVE' &&
  participation.deliveryStatus === 'PENDING_DELIVERY' &&
  (participation.paymentMethod === 'CASH' || participation.finalPaymentStatus === 'PAID');

const parseExpectedDate = (value) => {
  if (!value) return { date: undefined };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { error: 'Invalid expected delivery date' };
  if (d.getTime() < Date.now() - 24 * 60 * 60 * 1000) return { error: 'Expected delivery date cannot be in the past' };
  return { date: d };
};

// loads the pool and makes sure the requesting supplier owns it and it is COMPLETED
const loadOwnedCompletedPool = async (req, poolId) => {
  const supplier = await Supplier.findOne({ userId: req.user._id });
  if (!supplier) return { status: 404, message: 'No supplier profile found for this user' };

  const pool = await Pool.findById(poolId);
  if (!pool) return { status: 404, message: 'Pool not found' };
  if (String(pool.supplierId) !== String(supplier._id)) return { status: 403, message: 'You do not own this pool' };
  if (pool.status !== 'COMPLETED') {
    return { status: 400, message: 'Orders can only be shipped after the pool is confirmed' };
  }
  return { pool };
};

// @route   PUT /api/participations/:id/mark-shipped
// @access  Private (supplier only)
export const markShipped = async (req, res) => {
  try {
    const participation = await Participation.findById(req.params.id);
    if (!participation) {
      return res.status(404).json({ message: 'Participation not found' });
    }

    const owned = await loadOwnedCompletedPool(req, participation.poolId);
    if (owned.message) return res.status(owned.status).json({ message: owned.message });

    if (participation.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Cannot ship a cancelled participation' });
    }
    if (participation.deliveryStatus !== 'PENDING_DELIVERY') {
      return res.status(400).json({ message: 'This order was already shipped' });
    }
    if (!isShippable(participation)) {
      return res.status(400).json({ message: 'The shop has not paid the remaining balance yet' });
    }

    const { date, error } = parseExpectedDate(req.body.expectedDeliveryDate);
    if (error) return res.status(400).json({ message: error });

    participation.deliveryStatus = 'OUT_FOR_DELIVERY';
    participation.shippedAt = new Date();
    if (date) participation.expectedDeliveryDate = date;
    await participation.save();

    res.status(200).json({ message: 'Order marked as shipped', participation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/participations/pool/:poolId/mark-shipped
// @access  Private (supplier only)
// ships every order of the pool that is ready (cash, or remaining balance paid) in one
// click; the rest are skipped and reported so the supplier knows who is still pending
export const markPoolShipped = async (req, res) => {
  try {
    const owned = await loadOwnedCompletedPool(req, req.params.poolId);
    if (owned.message) return res.status(owned.status).json({ message: owned.message });

    const { date, error } = parseExpectedDate(req.body.expectedDeliveryDate);
    if (error) return res.status(400).json({ message: error });

    const pending = await Participation.find({
      poolId: owned.pool._id,
      status: 'ACTIVE',
      deliveryStatus: 'PENDING_DELIVERY',
    });
    const ready = pending.filter(isShippable);

    if (ready.length > 0) {
      await Participation.updateMany(
        { _id: { $in: ready.map((p) => p._id) } },
        {
          $set: {
            deliveryStatus: 'OUT_FOR_DELIVERY',
            shippedAt: new Date(),
            ...(date ? { expectedDeliveryDate: date } : {}),
          },
        }
      );
    }

    res.status(200).json({
      message: 'Orders marked as shipped',
      shippedCount: ready.length,
      skippedCount: pending.length - ready.length,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};