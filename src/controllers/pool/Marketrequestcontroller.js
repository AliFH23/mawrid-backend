import MarketRequest from '../../models/MarketRequest.js';
import Shop from '../../models/Shop.js';
import Supplier from '../../models/Supplier.js';
import Pool from '../../models/Pool.js';
import Category from '../../models/Category.js';

const REQUEST_LIFETIME_DAYS = 14;
const MAX_OPEN_REQUESTS_PER_SHOP = 5;
const MAX_VOTE_QUANTITY = 10000;

const POOL_SUMMARY_FIELDS = 'productName unitPrice expiryDate status currentQuantity minQuantity';

const populateRequest = (query) =>
  query
    .populate('categoryIds', 'name requiresExpiry')
    .populate('deliveryZone')
    .populate('poolId', POOL_SUMMARY_FIELDS);

// requests nobody turned into a pool by their deadline just flip to EXPIRED — done lazily
// on every read/write, so there is no extra scheduled job to keep alive
const expireStaleRequests = () =>
  MarketRequest.updateMany({ status: 'OPEN', expiresAt: { $lte: new Date() } }, { $set: { status: 'EXPIRED' } });

// what a client is allowed to see. Voter identities are NEVER sent — a supplier (or another
// shop) only sees how many shops and how many units, which keeps contact on the platform.
const toDto = (request, myShopId) => {
  const votes = request.votes || [];
  const mine = myShopId ? votes.find((v) => String(v.shopId) === String(myShopId)) : null;

  return {
    _id: request._id,
    productName: request.productName,
    description: request.description,
    categoryIds: request.categoryIds,
    deliveryZone: request.deliveryZone,
    status: request.status,
    expiresAt: request.expiresAt,
    createdAt: request.createdAt,
    supportersCount: votes.length,
    totalQuantity: votes.reduce((sum, v) => sum + v.quantity, 0),
    myQuantity: mine ? mine.quantity : null,
    isCreator: myShopId ? String(request.createdByShop) === String(myShopId) : false,
    pool: request.poolId && request.poolId._id ? request.poolId : null,
  };
};

const parseQuantity = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_VOTE_QUANTITY) return null;
  return n;
};

const getMyShop = (req) => Shop.findOne({ userId: req.user._id });

// @route   GET /api/market-requests
// @query   mine=true (buyer: every request I backed, any status) | categoryId | zoneId
// @access  Private (buyer, supplier, admin)
export const listRequests = async (req, res) => {
  try {
    await expireStaleRequests();

    let myShopId = null;
    const filter = {};

    if (req.user.role === 'buyer') {
      const shop = await getMyShop(req);
      if (!shop) return res.status(404).json({ message: 'No shop found for this user' });
      myShopId = shop._id;
    }

    if (req.query.mine === 'true' && myShopId) {
      filter['votes.shopId'] = myShopId;
    } else {
      filter.status = 'OPEN';
    }
    if (req.query.categoryId) filter.categoryIds = req.query.categoryId;
    if (req.query.zoneId) filter.deliveryZone = req.query.zoneId;

    const requests = await populateRequest(MarketRequest.find(filter));
    const items = requests.map((r) => toDto(r, myShopId));

    // biggest demand first; newest first among equals
    items.sort((a, b) => b.totalQuantity - a.totalQuantity || new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({ requests: items });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/market-requests
// @access  Private (buyer only)
export const createRequest = async (req, res) => {
  try {
    await expireStaleRequests();

    const shop = await getMyShop(req);
    if (!shop) return res.status(404).json({ message: 'No shop found for this user' });

    const { productName, description, categoryIds, quantity } = req.body;

    if (!productName || !productName.trim()) {
      return res.status(400).json({ message: 'productName is required' });
    }
    if (!Array.isArray(categoryIds) || categoryIds.length < 1 || categoryIds.length > 3) {
      return res.status(400).json({ message: 'Choose between 1 and 3 categories' });
    }
    const qty = parseQuantity(quantity);
    if (!qty) {
      return res.status(400).json({ message: `quantity must be a whole number between 1 and ${MAX_VOTE_QUANTITY}` });
    }

    const validCategories = await Category.find({ _id: { $in: categoryIds }, isActive: true });
    if (validCategories.length !== categoryIds.length) {
      return res.status(400).json({ message: 'One or more category ids are invalid' });
    }

    const openCount = await MarketRequest.countDocuments({ createdByShop: shop._id, status: 'OPEN' });
    if (openCount >= MAX_OPEN_REQUESTS_PER_SHOP) {
      return res.status(400).json({
        message: `You already have ${MAX_OPEN_REQUESTS_PER_SHOP} open requests. Close one before creating another.`,
      });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REQUEST_LIFETIME_DAYS);

    const request = await MarketRequest.create({
      productName: productName.trim(),
      description: description?.trim() || undefined,
      categoryIds,
      deliveryZone: shop.deliveryZone,
      createdByShop: shop._id,
      votes: [{ shopId: shop._id, quantity: qty }],
      expiresAt,
    });

    const populated = await populateRequest(MarketRequest.findById(request._id));
    res.status(201).json({ request: toDto(populated, shop._id) });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/market-requests/:id/vote
// @body    { quantity }
// @access  Private (buyer only) — adds my vote, or changes it if I already backed this request
export const voteOnRequest = async (req, res) => {
  try {
    const shop = await getMyShop(req);
    if (!shop) return res.status(404).json({ message: 'No shop found for this user' });

    const qty = parseQuantity(req.body.quantity);
    if (!qty) {
      return res.status(400).json({ message: `quantity must be a whole number between 1 and ${MAX_VOTE_QUANTITY}` });
    }

    const openFilter = { _id: req.params.id, status: 'OPEN', expiresAt: { $gt: new Date() } };

    // 1) I already voted -> change my quantity
    let updated = await MarketRequest.findOneAndUpdate(
      { ...openFilter, 'votes.shopId': shop._id },
      { $set: { 'votes.$.quantity': qty } },
      { new: true }
    );

    // 2) first vote from this shop -> add it (the $ne guard stops a double-click adding twice)
    if (!updated) {
      updated = await MarketRequest.findOneAndUpdate(
        { ...openFilter, 'votes.shopId': { $ne: shop._id } },
        { $push: { votes: { shopId: shop._id, quantity: qty } } },
        { new: true }
      );
    }

    if (!updated) {
      return res.status(400).json({ message: 'This request is no longer open' });
    }

    const populated = await populateRequest(MarketRequest.findById(updated._id));
    res.status(200).json({ request: toDto(populated, shop._id) });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   DELETE /api/market-requests/:id/vote
// @access  Private (buyer only) — withdraw my backing; a request left with no votes is closed
export const withdrawVote = async (req, res) => {
  try {
    const shop = await getMyShop(req);
    if (!shop) return res.status(404).json({ message: 'No shop found for this user' });

    const updated = await MarketRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'OPEN', 'votes.shopId': shop._id },
      { $pull: { votes: { shopId: shop._id } } },
      { new: true }
    );

    if (!updated) {
      return res.status(400).json({ message: 'You have no active vote on this request' });
    }

    if (updated.votes.length === 0) {
      updated.status = 'CLOSED';
      await updated.save();
    }

    res.status(200).json({ message: 'Vote withdrawn' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/market-requests/:id/close
// @access  Private (buyer who created the request)
export const closeRequest = async (req, res) => {
  try {
    const shop = await getMyShop(req);
    if (!shop) return res.status(404).json({ message: 'No shop found for this user' });

    const request = await MarketRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });

    if (String(request.createdByShop) !== String(shop._id)) {
      return res.status(403).json({ message: 'Only the shop that created this request can close it' });
    }
    if (request.status !== 'OPEN') {
      return res.status(400).json({ message: `Cannot close a request with status ${request.status}` });
    }

    request.status = 'CLOSED';
    await request.save();

    res.status(200).json({ message: 'Request closed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/market-requests/:id/fulfill
// @body    { poolId }
// @access  Private (supplier only) — called right after the supplier saved the pool that was
//          pre-filled from this request, to link the two
export const fulfillRequest = async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ userId: req.user._id });
    if (!supplier) return res.status(404).json({ message: 'No supplier profile found for this user' });

    const { poolId } = req.body;
    const pool = poolId ? await Pool.findById(poolId) : null;
    if (!pool) return res.status(404).json({ message: 'Pool not found' });
    if (String(pool.supplierId) !== String(supplier._id)) {
      return res.status(403).json({ message: 'You do not own this pool' });
    }
    if (pool.status !== 'OPEN') {
      return res.status(400).json({ message: 'Only an open pool can be linked to a request' });
    }

    const updated = await MarketRequest.findOneAndUpdate(
      { _id: req.params.id, status: 'OPEN' },
      { $set: { status: 'FULFILLED', poolId: pool._id, fulfilledBySupplierId: supplier._id, fulfilledAt: new Date() } },
      { new: true }
    );
    if (!updated) {
      return res.status(400).json({ message: 'This request is no longer open' });
    }

    res.status(200).json({ message: 'Request linked to your pool' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};