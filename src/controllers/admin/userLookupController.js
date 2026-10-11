import User from '../../models/User.js';
import Shop from '../../models/Shop.js';
import Supplier from '../../models/Supplier.js';
import Pool from '../../models/Pool.js';
import Participation from '../../models/Participation.js';
import PurchaseOrder from '../../models/PurchaseOrder.js';
import Transaction from '../../models/Transaction.js';
import Fine from '../../models/Fine.js';
import { getShopsReliability } from '../../utils/shopReliability.js';

const MAX_ROWS = 100; // per list — a support lookup needs recent history, not a full export

const PUBLIC_ID_FORMAT = /^[A-Z]{3}-\d{3,}$/;

// sum of `amount` for one transaction type out of the grouped totals
const totalOf = (byType, type) => byType.find((t) => t.type === type)?.total || 0;
const round2 = (n) => Math.round(n * 100) / 100;

// @route   GET /api/admin/lookup/:publicId
// @access  Private (admin only)
// everything the platform knows about one shop or supplier, found by its public id
export const lookupUser = async (req, res) => {
  try {
    const publicId = String(req.params.publicId || '').trim().toUpperCase();

    if (!PUBLIC_ID_FORMAT.test(publicId)) {
      return res.status(400).json({ message: 'Invalid id format. Expected something like SHP-1001 or SUP-1001' });
    }

    const user = await User.findOne({ publicId });
    if (!user) {
      return res.status(404).json({ message: `No account found with id ${publicId}` });
    }

    const result = {
      user: {
        _id: user._id,
        publicId: user.publicId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    };

    // ─── shop side ───
    if (user.role === 'buyer') {
      const shop = await Shop.findOne({ userId: user._id })
        .populate('deliveryZone', 'name')
        .populate('categoryIds', 'name');
      result.profile = shop;

      if (shop) {
        const byType = await Transaction.aggregate([
          { $match: { shopId: shop._id } },
          { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
          { $project: { _id: 0, type: '$_id', total: 1, count: 1 } },
        ]);

        const feePaid = totalOf(byType, 'COMMITMENT_FEE_PAID');
        const finalPaid = totalOf(byType, 'FINAL_PAYMENT');
        const feeRefunded = totalOf(byType, 'COMMITMENT_FEE_REFUNDED');

        result.financialSummary = {
          byType,
          commitmentFeesPaid: round2(feePaid),
          finalPayments: round2(finalPaid),
          refunded: round2(feeRefunded),
          forfeited: round2(totalOf(byType, 'COMMITMENT_FEE_FORFEITED')),
          // what actually left the shop's pocket: everything paid minus what was handed back
          netPaid: round2(feePaid + finalPaid - feeRefunded),
          cashbackEarned: round2(totalOf(byType, 'CASHBACK_EARNED')),
          loyaltyDiscounts: round2(totalOf(byType, 'LOYALTY_DISCOUNT_APPLIED')),
          cashbackBalance: shop.cashbackBalance || 0,
        };

        result.reliability = (await getShopsReliability([shop._id])).get(String(shop._id));

        result.transactions = await Transaction.find({ shopId: shop._id })
          .populate('poolId', 'productName')
          .sort({ createdAt: -1 })
          .limit(MAX_ROWS);

        result.participations = await Participation.find({ shopId: shop._id })
          .populate('poolId', 'productName unitPrice status expiryDate')
          .sort({ createdAt: -1 })
          .limit(MAX_ROWS);
      }
    }

    // ─── supplier side ───
    if (user.role === 'supplier') {
      const supplier = await Supplier.findOne({ userId: user._id });
      result.profile = supplier;

      if (supplier) {
        const allPoolIds = await Pool.find({ supplierId: supplier._id }).distinct('_id');

        const byType = await Transaction.aggregate([
          { $match: { supplierId: supplier._id } },
          { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
          { $project: { _id: 0, type: '$_id', total: 1, count: 1 } },
        ]);

        // purchase orders have no supplier field of their own — they belong to the supplier
        // through the pool, exactly like the supplier's own "orders" page resolves them
        const confirmedAgg = await PurchaseOrder.aggregate([
          { $match: { poolId: { $in: allPoolIds }, status: 'CONFIRMED' } },
          {
            $group: {
              _id: null,
              orders: { $sum: 1 },
              totalAmount: { $sum: '$totalAmount' },
              supplierCommission: { $sum: '$supplierCommission' },
            },
          },
        ]);
        const confirmed = confirmedAgg[0] || { orders: 0, totalAmount: 0, supplierCommission: 0 };

        const fineAgg = await Fine.aggregate([
          { $match: { supplierId: supplier._id } },
          { $group: { _id: null, count: { $sum: 1 }, penalty: { $sum: '$reliabilityScorePenalty' } } },
        ]);
        const fines = fineAgg[0] || { count: 0, penalty: 0 };

        result.financialSummary = {
          byType,
          confirmedOrders: confirmed.orders,
          confirmedOrdersTotal: round2(confirmed.totalAmount),
          commissionPaid: round2(confirmed.supplierCommission),
          netEarnings: round2(confirmed.totalAmount - confirmed.supplierCommission),
          finesCount: fines.count,
          reliabilityPenaltyTotal: fines.penalty,
        };

        result.transactions = await Transaction.find({ supplierId: supplier._id })
          .populate('poolId', 'productName')
          .sort({ createdAt: -1 })
          .limit(MAX_ROWS);

        result.pools = await Pool.find({ supplierId: supplier._id })
          .select('productName unitPrice minQuantity maxQuantity currentQuantity status expiryDate createdAt')
          .sort({ createdAt: -1 })
          .limit(MAX_ROWS);

        result.purchaseOrders = await PurchaseOrder.find({ poolId: { $in: allPoolIds } })
          .populate('poolId', 'productName')
          .sort({ createdAt: -1 })
          .limit(MAX_ROWS);

        result.fines = await Fine.find({ supplierId: supplier._id })
          .populate('poolId', 'productName')
          .sort({ createdAt: -1 })
          .limit(MAX_ROWS);
      }
    }

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};