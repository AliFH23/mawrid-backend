import PurchaseOrder from '../models/PurchaseOrder.js';
import Pool from '../models/Pool.js';
import Supplier from '../models/Supplier.js';

// @route   GET /api/purchase-orders/me
// @access  Private (supplier only)
export const getMyPurchaseOrders = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ userId: req.user._id });
    if (!supplier) {
      return res.status(404).json({ message: 'No supplier profile found for this user' });
    }

    const myPools = await Pool.find({ supplierId: supplier._id }).select('_id');
    const poolIds = myPools.map((p) => p._id);

    const purchaseOrders = await PurchaseOrder.find({ poolId: { $in: poolIds } })
      .populate('poolId')
      .sort({ createdAt: -1 });

    res.status(200).json({ purchaseOrders });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/purchase-orders
// @access  Private (admin only)
export const getAllPurchaseOrders = async (req, res) => {
  try {
    const purchaseOrders = await PurchaseOrder.find()
      .populate({
        path: 'poolId',
        populate: { path: 'supplierId categoryIds' },
      })
      .sort({ createdAt: -1 });

    res.status(200).json({ purchaseOrders });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};