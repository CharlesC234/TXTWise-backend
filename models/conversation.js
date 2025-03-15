const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  user: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Many-to-many with Users
  llm: { type: String, enum: ['claude', 'chatgpt', 'gemini', 'grok', 'deepseek'], default: 'chatgpt' },
  initialPromt: { type: String, default: "" },
  fromPhone: { type: String, default: "+12394743734" },
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }], // Many-to-many with Messages
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  paused: { type: Boolean, default: false },
});

module.exports = mongoose.model('Conversation', ConversationSchema);
