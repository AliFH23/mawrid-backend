import Courier from '../../models/Courier.js';
import DeliveryZone from '../../models/DeliveryZone.js';
import Participation from '../../models/Participation.js';
import Shop from '../../models/Shop.js';

const VEHICLE_TYPES = ['MOTORCYCLE', 'CAR', 'VAN', 'TRUCK'];

// how many unfinished deliveries one courier may hold at the same time — stops someone
// from claiming the whole board and then not delivering
const MAX_ACTIVE_CLAIMS = 10;

const zonePopulate = { path: 'deliveryZone', populate: { path: 'governorateId', select: 'name' } };

const countActiveClaims = (courierId) =>
  Participation.countDocuments({ courierId, status: 'ACTIVE', deliveryStatus: { $ne: 'DELIVERED' } });

// @route   POST /api/couriers
// @access  Private (courier only)
export const createCourier = async (req, res) => {
  try {
    const { deliveryZone, vehicleType } = req.body;
    if (!deliveryZone) {
      return res.status(400).json({ message: 'deliveryZone is required' });
    }
    if (vehicleType && !VEHICLE_TYPES.includes(vehicleType)) {
      return res.status(400).json({ message: 'Invalid vehicle type' });
    }

    const existing = await Courier.findOne({ userId: req.user._id });
    if (existing) {
      return res.status(400).json({ message: 'You already have a courier profile' });
    }

    const zone = await DeliveryZone.findOne({ _id: deliveryZone, isActive: true });
    if (!zone) {
      return res.status(400).json({ message: 'Invalid delivery zone id' });
    }

    const courier = await Courier.create({ userId: req.user._id, deliveryZone, vehicleType });
    await courier.populate(zonePopulate);
    res.status(201).json({ courier });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/couriers/me
// @access  Private (courier only)
export const getMyCourier = async (req, res) => {
  try {
    const courier = await Courier.findOne({ userId: req.user._id }).populate(zonePopulate);
    if (!courier) {
      return res.status(404).json({ message: 'No courier profile found for this user' });
    }
    res.status(200).json({ courier });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/couriers/me
// @access  Private (courier only)
export const updateMyCourier = async (req, res) => {
  try {
    const courier = await Courier.findOne({ userId: req.user._id });
    if (!courier) {
      return res.status(404).json({ message: 'No courier profile found for this user' });
    }

    const { deliveryZone, vehicleType } = req.body;

    if (vehicleType !== undefined) {
      if (!VEHICLE_TYPES.includes(vehicleType)) {
        return res.status(400).json({ message: 'Invalid vehicle type' });
      }
      courier.vehicleType = vehicleType;
    }

    if (deliveryZone !== undefined && String(deliveryZone) !== String(courier.deliveryZone)) {
      const zone = await DeliveryZone.findOne({ _id: deliveryZone, isActive: true });
      if (!zone) {
        return res.status(400).json({ message: 'Invalid delivery zone id' });
      }
      // orders already claimed belong to the old zone — finish or give them back first
      if ((await countActiveClaims(courier._id)) > 0) {
        return res.status(400).json({ message: 'Finish or release your current deliveries before changing your zone' });
      }
      courier.deliveryZone = deliveryZone;
    }

    await courier.save();
    await courier.populate(zonePopulate);
    res.status(200).json({ courier });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/couriers/available
// @access  Private (courier only)
// orders the suppliers offered to couriers, whose SHOP is in this courier's zone (and so
// in his governorate) and that nobody has claimed yet. Only what's needed to decide —
// no prices, no payment details, no phone numbers until the order is claimed.
export const getAvailableDeliveries = async (req, res) => {
  try {
    const courier = await Courier.findOne({ userId: req.user._id });
    if (!courier) {
      return res.status(404).json({ message: 'No courier profile found for this user' });
    }

    const shopIds = await Shop.find({ deliveryZone: courier.deliveryZone }).distinct('_id');

    const rows = await Participation.find({
      shopId: { $in: shopIds },
      offeredToCouriers: true,
      courierId: null,
      status: 'ACTIVE',
      deliveryStatus: 'PENDING_DELIVERY',
    })
      .populate({ path: 'poolId', select: 'productName supplierId', populate: { path: 'supplierId', select: 'companyName' } })
      .populate({ path: 'shopId', select: 'shopName' })
      .sort({ updatedAt: 1 })
      .limit(100);

    const deliveries = rows.map((p) => ({
      _id: p._id,
      productName: p.poolId?.productName,
      quantity: p.quantity,
      shopName: p.shopId?.shopName,
      supplierName: p.poolId?.supplierId?.companyName,
    }));

    res.status(200).json({ deliveries });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/couriers/deliveries
// @access  Private (courier only)
// the orders this courier claimed — contact details are included now because he needs
// them to pick up from the supplier and deliver to the shop
export const getMyDeliveries = async (req, res) => {
  try {
    const courier = await Courier.findOne({ userId: req.user._id });
    if (!courier) {
      return res.status(404).json({ message: 'No courier profile found for this user' });
    }

    const rows = await Participation.find({ courierId: courier._id, status: 'ACTIVE' })
      .populate({
        path: 'poolId',
        select: 'productName supplierId',
        populate: { path: 'supplierId', select: 'companyName userId', populate: { path: 'userId', select: 'name phone' } },
      })
      .populate({
        path: 'shopId',
        select: 'shopName deliveryZone userId',
        populate: [
          { path: 'userId', select: 'name phone' },
          { path: 'deliveryZone', select: 'name' },
        ],
      })
      .sort({ claimedAt: -1 })
      .limit(100);

    const deliveries = rows.map((p) => ({
      _id: p._id,
      productName: p.poolId?.productName,
      quantity: p.quantity,
      deliveryStatus: p.deliveryStatus,
      claimedAt: p.claimedAt,
      shippedAt: p.shippedAt,
      deliveredAt: p.deliveredAt,
      shop: {
        name: p.shopId?.shopName,
        owner: p.shopId?.userId?.name,
        phone: p.shopId?.userId?.phone,
        zone: p.shopId?.deliveryZone?.name,
      },
      supplier: {
        company: p.poolId?.supplierId?.companyName,
        name: p.poolId?.supplierId?.userId?.name,
        phone: p.poolId?.supplierId?.userId?.phone,
      },
    }));

    res.status(200).json({ deliveries });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/couriers/deliveries/:id/claim
// @access  Private (courier only)
export const claimDelivery = async (req, res) => {
  try {
    const courier = await Courier.findOne({ userId: req.user._id });
    if (!courier) {
      return res.status(404).json({ message: 'No courier profile found for this user' });
    }

    const participation = await Participation.findById(req.params.id).populate('shopId', 'deliveryZone');
    if (!participation || !participation.shopId) {
      return res.status(404).json({ message: 'Order not found' });
    }

    if (String(participation.shopId.deliveryZone) !== String(courier.deliveryZone)) {
      return res.status(403).json({ message: 'This order is outside your delivery zone' });
    }

    if ((await countActiveClaims(courier._id)) >= MAX_ACTIVE_CLAIMS) {
      return res.status(400).json({ message: `You can hold at most ${MAX_ACTIVE_CLAIMS} unfinished deliveries at once` });
    }

    // one atomic update: if two couriers tap "claim" together, only one of them matches
    // (the other finds courierId already set) — no double assignment
    const claimed = await Participation.findOneAndUpdate(
      {
        _id: participation._id,
        offeredToCouriers: true,
        courierId: null,
        status: 'ACTIVE',
        deliveryStatus: 'PENDING_DELIVERY',
      },
      { $set: { courierId: courier._id, claimedAt: new Date() } },
      { new: true }
    );

    if (!claimed) {
      return res.status(409).json({ message: 'This order is no longer available' });
    }

    res.status(200).json({ message: 'Order claimed', participation: claimed });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/couriers/deliveries/:id/start
// @access  Private (courier only)
// the courier picked the goods up and is on his way → the shop now sees "in the way"
// and can confirm receipt (the existing confirm-receipt flow)
export const startDelivery = async (req, res) => {
  try {
    const courier = await Courier.findOne({ userId: req.user._id });
    if (!courier) {
      return res.status(404).json({ message: 'No courier profile found for this user' });
    }

    const updated = await Participation.findOneAndUpdate(
      { _id: req.params.id, courierId: courier._id, status: 'ACTIVE', deliveryStatus: 'PENDING_DELIVERY' },
      { $set: { deliveryStatus: 'OUT_FOR_DELIVERY', shippedAt: new Date() } },
      { new: true }
    );

    if (!updated) {
      return res.status(400).json({ message: 'This order is not waiting for pickup by you' });
    }

    res.status(200).json({ message: 'Delivery started', participation: updated });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/couriers/deliveries/:id/release
// @access  Private (courier only)
// gives a claimed order back to the board (only before it has left the supplier)
export const releaseDelivery = async (req, res) => {
  try {
    const courier = await Courier.findOne({ userId: req.user._id });
    if (!courier) {
      return res.status(404).json({ message: 'No courier profile found for this user' });
    }

    const released = await Participation.findOneAndUpdate(
      { _id: req.params.id, courierId: courier._id, status: 'ACTIVE', deliveryStatus: 'PENDING_DELIVERY' },
      { $unset: { courierId: 1, claimedAt: 1 } },
      { new: true }
    );

    if (!released) {
      return res.status(400).json({ message: 'You can only release an order that has not started delivery' });
    }

    res.status(200).json({ message: 'Order released', participation: released });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};