const mongoose = require('mongoose');

const tempsSchema = new mongoose.Schema({
  signupToken: { type: String, required: true, unique: true },
  data: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now, expires: 3600 }, // Automatically delete after 1 hour
});

module.exports = mongoose.model('Temps', tempsSchema);