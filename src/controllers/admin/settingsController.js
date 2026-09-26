import PlatformSettings from '../../models/PlatformSettings.js';
import Fine from '../../models/Fine.js';

// @route   GET /api/settings
// @access  Private (any logged-in user)
export const getSettings = async (req, res) => {
  try {
    const settings = await PlatformSettings.getSingleton();
    res.status(200).json({ settings });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/settings
// @access  Private (admin only)
export const updateSettings = async (req, res) => {
  try {
    const { commitmentFeeRate, supplierCommissionRate, buyerCommissionRate, maxSharePerShop } = req.body;

    const settings = await PlatformSettings.getSingleton();

    if (commitmentFeeRate !== undefined) settings.commitmentFeeRate = commitmentFeeRate;
    if (supplierCommissionRate !== undefined) settings.supplierCommissionRate = supplierCommissionRate;
    if (buyerCommissionRate !== undefined) settings.buyerCommissionRate = buyerCommissionRate;
    if (maxSharePerShop !== undefined) settings.maxSharePerShop = maxSharePerShop;

    await settings.save();

    res.status(200).json({ settings });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/admin/fines
// @access  Private (admin only)
export const getAllFines = async (req, res) => {
  try {
    const fines = await Fine.find()
      .populate({ path: 'supplierId', select: 'companyName commercialRegistrationNumber' })
      .populate('poolId', 'productName')
      .sort({ createdAt: -1 });
    res.status(200).json({ fines });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};