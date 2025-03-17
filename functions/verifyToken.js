require('dotenv').config();
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  // Check Authorization header first
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1]; // Extract token after 'Bearer '
  } else if (req.cookies && req.cookies.token) {
    // Fallback to cookie if header not present
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Forbidden: Invalid token' });
    req.userId = decoded.id;
    next();
  });
};

module.exports = {
  verifyToken
};
