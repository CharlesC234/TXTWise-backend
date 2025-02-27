const TemporaryPortrait = require('../models/temp');
require('dotenv').config();

// Save temporary signup data
const saveTemporarySignupData = async (signupToken, data) => {
  const existing = await TemporaryPortrait.findOne({ signupToken });
  if (existing) {
    // Update existing record
    existing.data = data;
    existing.createdAt = new Date(); // Reset expiration
    await existing.save();
  } else {
    // Create new record
    const tempPortrait = new TemporaryPortrait({ signupToken, data });
    await tempPortrait.save();
  }
};

// Retrieve temporary signup data
const getTemporarySignupData = async (signupToken) => {
  const record = await TemporaryPortrait.findOne({ signupToken });
  return record ? record.data : null;
};

// Delete temporary signup data
const deleteTemporarySignupData = async (signupToken) => {
  await TemporaryPortrait.deleteOne({ signupToken });
};

module.exports = {
  saveTemporarySignupData,
  getTemporarySignupData,
  deleteTemporarySignupData,
};
