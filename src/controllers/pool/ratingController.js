import Rating from '../../models/Rating.js';
import Participation from '../../models/Participation.js';
import Shop from '../../models/Shop.js';
import Supplier from '../../models/Supplier.js';
import Pool from '../../models/Pool.js';

// @route   POST /api/ratings
// @access  Private (buyer only)
export const createRating = async (req, res) => {
  try {
    const { poolId, stars, comment } = req.body;

    if (!poolId || !stars || stars < 1 || stars > 5) {
      return res.status(400).json({ message: 'poolId and a stars value between 1 and 5 are required' });
    }

    const shop = await Shop.findOne({ userId: req.user._id });
    if (!shop) {
      return res.status(404).json({ message: 'No shop found for this user' });
    }

    const participation = await Participation.findOne({ poolId, shopId: shop._id, status: 'ACTIVE' });
    if (!participation) {
      return res.status(400).json({ message: 'You did not participate in this pool' });
    }
    if (participation.deliveryStatus !== 'DELIVERED') {
      return res.status(400).json({ message: 'You can only rate a supplier after confirming receipt of your order' });
    }
    if (participation.rated) {
      return res.status(400).json({ message: 'You have already rated this order' });
    }

    const pool = await Pool.findById(poolId);
    if (!pool) {
      return res.status(404).json({ message: 'Pool not found' });
    }

    const rating = await Rating.create({
      shopId: shop._id,
      supplierId: pool.supplierId,
      poolId: pool._id,
      stars,
      comment,
    });

    participation.rated = true;
    await participation.save();

    const supplier = await Supplier.findById(pool.supplierId);
    const newCount = supplier.ratingCount + 1;
    const newAverage = (supplier.averageRating * supplier.ratingCount + stars) / newCount;
    supplier.ratingCount = newCount;
    supplier.averageRating = Math.round(newAverage * 10) / 10;
    await supplier.save();

    res.status(201).json({ rating });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'You have already rated this order' });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/ratings/supplier/:id
// @access  Private (any logged-in user)
export const getSupplierRatings = async (req, res) => {
  try {
    const ratings = await Rating.find({ supplierId: req.params.id })
      .populate('shopId', 'shopName')
      .sort({ createdAt: -1 });
    res.status(200).json({ ratings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};