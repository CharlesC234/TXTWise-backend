// Updated logTokenUsage function
const TokenUsage = require('../models/tokens'); // Assuming path
const User = require('../models/user');

async function logTokenUsage(userId, modelName, messageText, isImage) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Estimate tokens used (basic heuristic: 1 token per 4 characters)
  let estimatedTokens = Math.ceil(messageText.length / 4);

  if(isImage){
    estimatedTokens = 150;
  }

  // Update TokenUsage collection
  await TokenUsage.findOneAndUpdate(
    { user: userId, model: modelName, date: today },
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