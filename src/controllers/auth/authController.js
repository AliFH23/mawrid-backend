import User from '../../models/User.js';
import generateToken from '../../utils/generateToken.js';

// @route   GET /api/auth/check-email
// @access  Public
export const checkEmailAvailability = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ message: 'email is required' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    res.status(200).json({ available: !existingUser });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/auth/register
// @access  Public
export const registerUser = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    if (!name || !email || !password || !phone || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'A user with this email already exists' });
    }

    const user = await User.create({ name, email, password, phone, role });

    res.status(201).json({
      user,
      token: generateToken(user._id, user.role),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'A user with this email already exists' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};

// @route   POST /api/auth/login
// @access  Public
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'This account has been disabled' });
    }

    res.status(200).json({
      user,
      token: generateToken(user._id, user.role),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
  res.status(200).json({ user: req.user });
};

// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = async (req, res) => {
  try {
    const { email, phone, newPassword } = req.body;

    if (!email || !phone || !newPassword) {
      return res.status(400).json({ message: 'email, phone, and newPassword are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'newPassword must be at least 6 characters' });
    }

    const user = await User.findOne({ email });

    if (!user || user.phone !== phone) {
      return res.status(400).json({ message: 'No account matches this email and phone number' });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ message: 'Password updated successfully. You can now log in.' });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message });
  }
};