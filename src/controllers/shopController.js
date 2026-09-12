import Shop from '../models/Shop.js';
import Category from '../models/Category.js';

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

    // make sure every category id actually exists and is active, so we don't link to garbage ids
    const validCategories = await Category.find({
      _id: { $in: categoryIds },
      isActive: true,
    });
    if (validCategories.length !== categoryIds.length) {
      return res.status(400).json({ message: 'One or more category ids are invalid' });
    }

    const shop = await Shop.create({
      userId: req.user._id,
      shopName,
      categoryIds,
      deliveryZone,
    });

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
    const shop = await Shop.findOne({ userId: req.user._id }).populate('categoryIds');

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

    const shop = await Shop.findOneAndUpdate(
      { userId: req.user._id },
      { shopName, categoryIds, deliveryZone },
      { new: true, runValidators: true }
    );

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
    const shops = await Shop.find().populate('categoryIds').populate('userId', 'name email phone');
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
      .populate('userId', 'name email phone');

    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    res.status(200).json({ shop });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};