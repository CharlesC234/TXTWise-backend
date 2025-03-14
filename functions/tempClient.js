const Temps = require('../models/temp');
require('dotenv').config();
// Save temporary signup data
const saveTemporarySignupData = async (signupToken, data) => {
  const existing = await Temps.findOne({ signupToken });
  if (existing) {
    // Update existing record
    existing.data = data;
    existing.createdAt = new Date(); // Reset expiration
    await existing.save();
  } else {
    // Create new record
    const temp = new Temps({ signupToken, data });
    await temp.save();
  }
};

// Retrieve temporary signup data
const getTemporarySignupData = async (signupToken) => {
  const record = await Temps.findOne({ signupToken });
  return record ? record.data : null;
};

// Delete temporary signup data
const deleteTemporarySignupData = async (signupToken) => {
  await Temps.deleteOne({ signupToken });
};

module.exports = {
  saveTemporarySignupData,
  getTemporarySignupData,
  deleteTemporarySignupData,
};
