const fetch = require('node-fetch');
require('dotenv').config();

/**
 * Send SMS using SignalWire API
 * @param {string} body - The message body
 * @param {string} from - The sender's phone number (your SignalWire number)
 * @param {string} to - The recipient's phone number
 * @returns {Promise<object>} - API response or error
 */
async function sendSms(body, from, to) {
  const signalwireUrl = `${process.env.SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${process.env.SIGNALWIRE_PROJECT_ID}/Messages.json`;

  const authHeader = `Basic ${Buffer.from(`${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`).toString('base64')}`;

  const formBody = new URLSearchParams({
    From: from,
    To: to,
    Body: body,
  });

  console.log("attempting to send: " + body + " From: " + from + "To: " + to);

  try {
    const response = await fetch(signalwireUrl, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: formBody.toString(),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.message || 'Failed to send SMS.');
    }

    return { success: true, message: 'SMS sent successfully.', response: result };
  } catch (error) {
    console.error('Error sending SMS via SignalWire:', error);
    return { success: false, message: error.message };
  }
}

module.exports = sendSms;
