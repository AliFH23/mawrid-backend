import Shop from '../models/Shop.js';
import Category from '../models/Category.js';
import DeliveryZone from '../models/DeliveryZone.js';

// nested populate used everywhere below: shop.deliveryZone.governorateId comes back
// as a full { _id, name } object, not just a raw id — this is what lets the frontend
// pre-select "current governorate" correctly on the settings page instead of showing
// an empty field that looks like you're adding a brand new one
const DELIVERY_ZONE_POPULATE = { path: 'deliveryZone', populate: { path: 'governorateId' } };

// @route   POST /api/shops
// @access  Private (buyer only)
export const createShop = async (req, res) => {
  try {
    if (req.user.role !== 'buyer') {
      return res.status(403).json({ message: 'Only buyer accounts can create a shop' });
    }

    const { shopName, categoryIds, deliveryZone } = req.body;

    if (!shopName || !categoryIds || !deliveryZone) {
      return res.status(400).json({ message: 'shopName, categoryIds, and deliveryZone are required' });
    }

    const existingShop = await Shop.findOne({ userId: req.user._id });
    if (existingShop) {
      return res.status(400).json({ message: 'This user already has a shop' });
    }

    const validCategories = await Category.find({
      _id: { $in: categoryIds },
      isActive: true,
    });
    if (validCategories.length !== categoryIds.length) {
      return res.status(400).json({ message: 'One or more category ids are invalid' });
    }

    const zone = await DeliveryZone.findOne({ _id: deliveryZone, isActive: true });
    if (!zone) {
      return res.status(400).json({ message: 'Invalid delivery zone id' });
    }

    const shop = await Shop.create({
      userId: req.user._id,
      shopName,
      categoryIds,
      deliveryZone,
    });

    await shop.populate(['categoryIds', DELIVERY_ZONE_POPULATE]);

    res.status(201).json({ shop });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/shops/me
// @access  Private (buyer only)
export const getMyShop = async (req, res) => {
  try {
    const shop = await Shop.findOne({ userId: req.user._id })
      .populate('categoryIds')
      .populate(DELIVERY_ZONE_POPULATE);

    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user' });
    }

    res.status(200).json({ shop });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/shops/me
// @access  Private (buyer only)
export const updateMyShop = async (req, res) => {
  try {
    const { shopName, categoryIds, deliveryZone } = req.body;

    if (categoryIds) {
      const validCategories = await Category.find({
        _id: { $in: categoryIds },
        isActive: true,
      });
      if (validCategories.length !== categoryIds.length) {
        return res.status(400).json({ message: 'One or more category ids are invalid' });
      }
    }

    if (deliveryZone) {
      const zone = await DeliveryZone.findOne({ _id: deliveryZone, isActive: true });
      if (!zone) {
        return res.status(400).json({ message: 'Invalid delivery zone id' });
      }
    }

    const shop = await Shop.findOneAndUpdate(
      { userId: req.user._id },
      { shopName, categoryIds, deliveryZone },
      { new: true, runValidators: true }
    )
      .populate('categoryIds')
      .populate(DELIVERY_ZONE_POPULATE);

    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user' });
    }

    res.status(200).json({ shop });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/shops
// @access  Private (admin only)
export const getShops = async (req, res) => {
  try {
    const shops = await Shop.find()
      .populate('categoryIds')
      .populate(DELIVERY_ZONE_POPULATE)
      .populate('userId', 'name email phone');
    res.status(200).json({ shops });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/shops/:id
// @access  Private (admin only)
export const getShopById = async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id)
      .populate('categoryIds')
      .populate(DELIVERY_ZONE_POPULATE)
      .populate('userId', 'name email phone');

    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    res.status(200).json({ shop });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};