import Participation from '../models/Participation.js';
import Shop from '../models/Shop.js';
import Pool from '../models/Pool.js';


// @route   GET /api/participations/me
// @access  Private (buyer only)
// this is the shop's "History" tab — every pool they've ever joined, with its current status
export const getMyParticipations = async (req, res) => {
  try {
    const shop = await Shop.findOne({ userId: req.user._id });
    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user' });
    }

    const participations = await Participation.find({ shopId: shop._id })
      .populate('poolId')
      .sort({ createdAt: -1 }); // most recent first

    res.status(200).json({ participations });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// @route   PUT /api/participations/:id/confirm-receipt
// @access  Private (buyer only — must own this specific participation)
// the shop confirms the goods physically arrived. Only possible once the pool itself is
// COMPLETED (the supplier already confirmed and a PurchaseOrder exists) — a shop can't
// confirm receipt of something the supplier never agreed to ship in the first place.
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

    // ownership check — a shop can only confirm receipt for its own participation
    if (String(participation.shopId) !== String(shop._id)) {
      return res.status(403).json({ message: 'This participation does not belong to your shop' });
    }

    if (participation.status !== 'ACTIVE') {
      return res.status(400).json({ message: 'Cannot confirm receipt for a cancelled participation' });
    }

    if (participation.deliveryStatus === 'DELIVERED') {
      return res.status(400).json({ message: 'Receipt has already been confirmed for this participation' });
    }

    const pool = await Pool.findById(participation.poolId);
    if (!pool || pool.status !== 'COMPLETED') {
      return res.status(400).json({
        message: 'Cannot confirm receipt until the supplier has confirmed and completed this pool',
      });
    }

    participation.deliveryStatus = 'DELIVERED';
    participation.deliveredAt = new Date();
    await participation.save();

    res.status(200).json({ message: 'Receipt confirmed', participation });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};