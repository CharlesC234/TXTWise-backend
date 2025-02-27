const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  name: { type: String },
  subscriptionStatus: { type: String, enum: ['free', 'premium'], default: 'free' },
  dailyTokensRemaining: { type: Number, default: 100 },
  conversations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' }],
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', UserSchema);
