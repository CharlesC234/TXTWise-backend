const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  user: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  name: { type: String, default: "" },
  llm: { type: String, enum: ['claude', 'chatgpt', 'gemini', 'grok', 'deepseek'], default: 'chatgpt' },
  initialPrompt: { type: String, default: "" },
  fromPhone: { type: String, default: "+12394743734" },
  messages: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Message' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  paused: { type: Boolean, default: false },
  historyDisabled: { type: Boolean, default: false }
});


module.exports = mongoose.model('Conversation', ConversationSchema);
