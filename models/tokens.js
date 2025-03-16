const mongoose = require('mongoose');

const TokenUsageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Relation to user
  model: { type: String, enum: ['chatgpt', 'claude', 'deepseek', 'grok', 'gemini'], required: true },
  date: { type: Date, required: true },
  tokensUsed: { type: Number, default: 0 }
});

// Ensure only one record per user/model/date
TokenUsageSchema.index({ user: 1, model: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('TokenUsage', TokenUsageSchema);
