
require('dotenv').config();

const generateToken = (phoneNumber) => {
    return jwt.sign({ id: phoneNumber }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY });
  };

  module.exports = {
    generateToken
  };
  