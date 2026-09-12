import jwt from 'jsonwebtoken';

// creates a signed JWT containing the user's id and role
// the token is what the frontend stores and sends back on every request to prove who's logged in
const generateToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

export default generateToken;