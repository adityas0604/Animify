const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

function getSqsClient() {
  return new SQSClient({
    region: process.env.AWS_REGION,
    credentials:
      process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
}

/**
 * Enqueue a Manim render job. Message body: { videoId, script, sceneName }.
 * Requires SQS_RENDER_QUEUE_URL in the environment.
 */
async function sendCompileMessage({ videoId, script, sceneName }) {
  const queueUrl = process.env.SQS_RENDER_QUEUE_URL;
  if (!queueUrl) {
    throw new Error('SQS_RENDER_QUEUE_URL is not configured');
  }
  if (!videoId || script == null || !sceneName) {
    throw new Error('videoId, script, and sceneName are required');
  }

  const sqs = getSqsClient();
  const messageBody = JSON.stringify({ videoId, script, sceneName });

  return sqs.send(
    new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: messageBody,
    })
  );
}

module.exports = { sendCompileMessage };
