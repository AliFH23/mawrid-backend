import expirePools from '../../utils/expirePools.js';
import User from '../../models/User.js';

// @route   POST /api/admin/expire-pools
// @access  Private (admin only)
// manual trigger, useful for demos or if the automatic hourly check needs to run immediately
export const runExpirePoolsCheck = async (req, res) => {
  try {
    const expiredCount = await expirePools();
    res.status(200).json({ message: `${expiredCount} pool(s) expired and refunded` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/admin/users
// @access  Private (admin only)
// supports optional filter: ?role=buyer / supplier / admin
export const getUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;

    const users = await User.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ users });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   PUT /api/admin/users/:id/toggle-status
// @access  Private (admin only)
// flips isActive — disables a misbehaving account or re-enables one, without ever deleting the user
// (deleting would break every Shop/Supplier/Pool/Participation that still references them)
export const toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot disable your own account' });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({
      message: `User ${user.isActive ? 'activated' : 'deactivated'}`,
      user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};