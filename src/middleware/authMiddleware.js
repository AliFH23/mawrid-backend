import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// verifies the JWT sent in the Authorization header and attaches the user to req.user
// any route wrapped with this middleware requires a valid, logged-in user
export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      req.user = await User.findById(decoded.id);

      if (!req.user) {
        return res.status(401).json({ message: 'User no longer exists' });
      }

      // even with a still-valid token, a deactivated account is blocked immediately —
      // otherwise disabling a user would only stop *future* logins, not sessions already in progress
      if (!req.user.isActive) {
        return res.status(403).json({ message: 'This account has been disabled' });
      }

      return next();
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, invalid token' });
    }
  }

  return res.status(401).json({ message: 'Not authorized, no token provided' });
};

// restricts a route to specific roles, used after protect
// example: router.post('/pools', protect, authorize('admin', 'supplier'), createPool)
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Role '${req.user.role}' is not allowed to perform this action`,
      });
    }
    next();
  };
};