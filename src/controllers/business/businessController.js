import jwt from 'jsonwebtoken';
import User from '../../models/User.js';
import Shop from '../../models/Shop.js';
import Supplier from '../../models/Supplier.js';
import BlockedBusiness from '../../models/BlockedBusiness.js';
import { getRegistrationStatus, normalizeRegNumber, isValidRegNumber, MESSAGES } from '../../utils/businessRegistry.js';

// reads the token if there is one but never rejects: the register page calls the check
// before login, while a logged-in person editing a profile wants "this number is yours"
export const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer')) {
      const decoded = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (user && user.isActive) req.user = user;
    }
  } catch {
    // bad/expired token → treated as logged out
  }
  next();
};

// @route   GET /api/business/check?number=...
// @access  Public (token optional)
// tells the person whether a registration number can be used: AVAILABLE, MINE (already
// linked to their own account), TAKEN (another account), BLOCKED (banned) or INVALID.
// It never says WHO owns a taken number.
export const checkRegistrationNumber = async (req, res) => {
  try {
    const { number } = req.query;
    if (!number) {
      return res.status(400).json({ message: 'number is required' });
    }

    const { status } = await getRegistrationStatus(number, { excludeUserId: req.user?._id });
    res.status(200).json({ status, message: MESSAGES[status] });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/business/blocked
// @access  Private (admin only)
export const getBlockedBusinesses = async (req, res) => {
  try {
    const blocked = await BlockedBusiness.find().populate('blockedBy', 'name').sort({ createdAt: -1 });
    res.status(200).json({ blocked });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/business/blocked
// @access  Private (admin only)
// bans a registration number: nobody can register or edit a profile with it, and the
// accounts that currently hold it are deactivated right away
export const blockBusiness = async (req, res) => {
  try {
    const number = normalizeRegNumber(req.body.number);
    if (!isValidRegNumber(number)) {
      return res.status(400).json({ message: MESSAGES.INVALID });
    }

    if (await BlockedBusiness.exists({ number })) {
      return res.status(400).json({ message: 'This number is already blocked' });
    }

    await BlockedBusiness.create({ number, reason: req.body.reason || '', blockedBy: req.user._id });

    const [shops, suppliers] = await Promise.all([
      Shop.find({ commercialRegistrationNumber: number }).select('userId'),
      Supplier.find({ commercialRegistrationNumber: number }).select('userId'),
    ]);
    const userIds = [...shops, ...suppliers].map((p) => p.userId);
    const result = await User.updateMany({ _id: { $in: userIds }, role: { $ne: 'admin' } }, { $set: { isActive: false } });

    res.status(201).json({ message: 'Number blocked', number, deactivatedAccounts: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   DELETE /api/business/blocked/:number
// @access  Private (admin only)
// lifts the ban on the number. Accounts deactivated by the block stay deactivated until
// the admin re-enables them from the users page — a deliberate second step.
export const unblockBusiness = async (req, res) => {
  try {
    const number = normalizeRegNumber(req.params.number);
    const removed = await BlockedBusiness.findOneAndDelete({ number });
    if (!removed) {
      return res.status(404).json({ message: 'This number is not blocked' });
    }
    res.status(200).json({ message: 'Number unblocked', number });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};