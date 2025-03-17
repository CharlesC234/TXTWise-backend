const TokenUsage = require('../models/tokens');
const User = require('../models/user');

async function logTokenUsage(userId, modelName, messageText, isImage) {
  const now = new Date();
  now.setMinutes(0, 0, 0); // Normalize to start of the hour
  const usageDate = new Date(now);

  // Estimate tokens used (simple heuristic)
  let estimatedTokens = Math.ceil(messageText.length / 4);
  if (isImage) {
    estimatedTokens = 150; // Flat token cost for image gen
  }

  // Update TokenUsage collection for the correct hour
  await TokenUsage.findOneAndUpdate(
    { user: userId, model: modelName, date: usageDate },
    { $inc: { tokensUsed: estimatedTokens } },
    { upsert: true, new: true }
  );

  // Update User's dailyTokensRemaining if on free plan
  const user = await User.findById(userId);
  if (user && user.subscriptionStatus === 'free') {
    const newRemaining = Math.max(user.dailyTokensRemaining - estimatedTokens, 0);
    user.dailyTokensRemaining = newRemaining;
    await user.save();
  }

  return estimatedTokens;
}

module.exports = {
  logTokenUsage
};
