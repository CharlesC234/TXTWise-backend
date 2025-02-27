require('dotenv').config();
/**
 * JWT Verification Middleware
 */
const verifyToken = (req, res, next) => {
    const token = req.cookies.token; // Token stored in HTTP-only cookie
  
    if (!token) return res.status(401).json({ message: 'Unauthorized: No token provided' });
  
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) return res.status(403).json({ message: 'Forbidden: Invalid token' });
      req.userId = decoded.id;
      next();
    });
  };
  

  module.exports = {
    verifyToken
  };
  