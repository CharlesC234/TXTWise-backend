const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  messageBody: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  isAI: { type: Boolean, default: false }, // Distinguish user vs AI messages
});

module.exports = mongoose.model('Message', MessageSchema);
