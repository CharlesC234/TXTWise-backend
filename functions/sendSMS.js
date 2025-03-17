const fetch = require('node-fetch');
require('dotenv').config();

const signalwireUrl = `${process.env.SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${process.env.SIGNALWIRE_PROJECT_ID}/Messages.json`;
const authHeader = `Basic ${Buffer.from(`${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`).toString('base64')}`;

// Queue Map per phone number (from number) => Queue
const smsQueues = new Map();  // e.g., "+1234567890" => [{ body, from, to, mediaUrl, resolve, reject }]
const processingStatus = new Map();  // Tracks which numbers are currently processing

/**
 * Internal: Process queue for a specific phone number
 */
async function processQueueForNumber(fromNumber) {
  if (processingStatus.get(fromNumber)) return;  // Already processing
  processingStatus.set(fromNumber, true);

  const queue = smsQueues.get(fromNumber);
  if (!queue) {
    processingStatus.delete(fromNumber);
    return;
  }

  while (queue.length > 0) {
    const job = queue.shift();
    try {
      const result = await sendSmsImmediate(job.body, job.from, job.to, job.mediaUrl);
      job.resolve(result);
    } catch (err) {
      job.reject(err);
    }

    // Wait 1 second between messages for this number
    await new Promise(res => setTimeout(res, 1000));
  }

  processingStatus.delete(fromNumber);  // Finished processing
}

/**
 * Internal: Immediate sending without queuing (rate-limit risk if used directly)
 */
async function sendSmsImmediate(body, from, to, mediaUrl = null) {
  const formBody = new URLSearchParams({
    From: from,
    To: to,
    Body: body,
  });

  if (mediaUrl) {
    formBody.append('MediaUrl', mediaUrl);
  }

  console.log(`Sending SMS/MMS to ${to}: ${body} ${mediaUrl ? `(Media: ${mediaUrl})` : ''}`);

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
  if (!response.ok) throw new Error(result.message || 'Failed to send message.');
  return { success: true, message: 'Message sent successfully.', response: result };
}

/**
 * Public: Rate-limited SMS sending with per-number queues
 */
async function sendSms(body, from, to, mediaUrl = null) {
  return new Promise((resolve, reject) => {
    if (!smsQueues.has(from)) {
      smsQueues.set(from, []);
    }

    smsQueues.get(from).push({ body, from, to, mediaUrl, resolve, reject });

    // Start processor for this number if not running
    processQueueForNumber(from);
  });
}

module.exports = sendSms;
