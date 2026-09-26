import mongoose from 'mongoose';
import Participation from '../../models/Participation.js';
import Shop from '../../models/Shop.js';
import Pool from '../../models/Pool.js';
import Transaction from '../../models/Transaction.js';
import PlatformSettings from '../../models/PlatformSettings.js';

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