import Participation from '../models/Participation.js';
import Shop from '../models/Shop.js';
import Pool from '../models/Pool.js';
import Transaction from '../models/Transaction.js';

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

    participation.finalPaymentStatus = 'PAID';
    await participation.save();

    const balance = participation.quantity * pool.unitPrice - participation.commitmentFeeAmount;
    await Transaction.create({
      type: 'FINAL_PAYMENT',
      amount: balance,
      poolId: pool._id,
      shopId: shop._id,
      description: `دفع المبلغ المتبقي — سلة "${pool.productName}"`,
    });

    res.status(200).json({ message: 'Remaining balance paid', participation });
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
      participation.finalPaymentStatus = 'PAID';
      const balance = participation.quantity * pool.unitPrice - participation.commitmentFeeAmount;
      await Transaction.create({
        type: 'FINAL_PAYMENT',
        amount: balance,
        poolId: pool._id,
        shopId: shop._id,
        description: `دفع نقدي عند الاستلام — سلة "${pool.productName}"`,
      });
    }

    await participation.save();

    res.status(200).json({ message: 'Receipt confirmed', participation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};