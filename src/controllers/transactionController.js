import Transaction from '../models/Transaction.js';

// @route   GET /api/transactions
// @access  Private (admin only)
export const getTransactions = async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.type = req.query.type;

    const transactions = await Transaction.find(filter)
      .populate('poolId', 'productName')
      .populate('shopId', 'shopName')
      .populate('supplierId', 'companyName')
      .sort({ createdAt: -1 });

    res.status(200).json({ transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};