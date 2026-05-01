'use strict';

const { PrismaClient } = require('@prisma/client');
const AWS = require('aws-sdk');
const openai = require('../lib/openaiClient');
const { response, parseBody } = require('../lib/lambda');

const prisma = new PrismaClient();

const s3 = new AWS.S3({ region: process.env.AWS_REGION });
const sqs = new AWS.SQS({ region: process.env.AWS_REGION });

// ── Helpers ──────────────────────────────────────────────────────────────────

async function generateManimScript(userPrompt) {
  const systemPrompt = `
You are a Manim expert. Given a user prompt, generate a complete Python script using Manim CE.

Rules:
- Only output valid Python code.
- Import only required modules from manim.
- Define exactly one class that inherits from Scene.
- Name the class in PascalCase and include construct(self).
- No explanations, no markdown. Only code.

Example output:
from manim import *

class PythagoreanScene(Scene):
    def construct(self):
        # animation code here
`;

  const result = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
  });

  return result.choices[0].message.content
    .trim()
    .replace(/^```python/, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();
}

function extractSceneName(script) {
  const match = script.match(/class\s+(\w+)\s*\(\s*[\w.]*Scene\s*\)/);
  return match ? match[1] : null;
}

// ── Handlers ─────────────────────────────────────────────────────────────────

exports.getVideos = async (event) => {
  const userId = event.requestContext.authorizer.lambda.userId;
  try {
    const videos = await prisma.video.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, prompt: true, filename: true, createdAt: true },
    });
    return response(200, videos);
  } catch (err) {
    console.error(err);
    return response(500, { error: 'Internal server error' });
  }
};

exports.generate = async (event) => {
  const userId = event.requestContext.authorizer.lambda.userId;
  const { prompt } = parseBody(event);
  try {
    const script = await generateManimScript(prompt);
    const video = await prisma.video.create({
      data: { userId, prompt, script, filename: '', status: 'PENDING' },
    });
    return response(200, { success: true, script, videoId: video.id });
  } catch (err) {
    console.error(err);
    return response(500, { error: 'Internal server error' });
  }
};

exports.compile = async (event) => {
  const userId = event.requestContext.authorizer.lambda.userId;
  const { videoId } = parseBody(event);
  try {
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.userId !== userId) {
      return response(403, { error: 'Unauthorized or video not found' });
    }

    const sceneName = extractSceneName(video.script);
    if (!sceneName) {
      return response(400, { error: 'No scene class found in the script!' });
    }

    await prisma.video.update({ where: { id: videoId }, data: { status: 'QUEUED' } });

    await sqs.sendMessage({
      QueueUrl: process.env.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ videoId, sceneName }),
    }).promise();

    return response(200, { success: true, status: 'queued', videoId });
  } catch (err) {
    console.error(err);
    return response(500, { error: 'Internal server error' });
  }
};

exports.getVideoStatus = async (event) => {
  const userId = event.requestContext.authorizer.lambda.userId;
  const id = event.pathParameters?.id;
  try {
    const video = await prisma.video.findUnique({ where: { id } });
    if (!video || video.userId !== userId) {
      return response(403, { error: 'Unauthorized or video not found' });
    }

    const result = { status: video.status, videoId: id };

    if (video.status === 'DONE' && video.filename) {
      result.videoUrl = s3.getSignedUrl('getObject', {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: video.filename,
        Expires: 3600,
      });
      result.downloadUrl = s3.getSignedUrl('getObject', {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: video.filename,
        Expires: 3600,
        ResponseContentDisposition: `attachment; filename="${video.filename.split('/').pop()}"`,
      });
    }

    if (video.status === 'FAILED') result.error = video.errorMsg;

    return response(200, result);
  } catch (err) {
    console.error(err);
    return response(500, { error: 'Internal server error' });
  }
};

exports.getPrompts = async (event) => {
  const userId = event.requestContext.authorizer.lambda.userId;
  try {
    const prompts = await prisma.video.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, prompt: true, createdAt: true, filename: true },
    });
    return response(200, prompts);
  } catch (err) {
    console.error(err);
    return response(500, { error: 'Failed to fetch prompt history' });
  }
};

exports.getCode = async (event) => {
  const userId = event.requestContext.authorizer.lambda.userId;
  const videoId = event.queryStringParameters?.videoId;
  if (!videoId) return response(400, { error: 'videoId is required' });
  try {
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video || video.userId !== userId) {
      return response(403, { error: 'Unauthorized or script not found' });
    }
    return response(200, { success: true, script: video.script });
  } catch (err) {
    console.error(err);
    return response(500, { error: 'Failed to retrieve script' });
  }
};

exports.clearHistory = async (event) => {
  const userId = event.requestContext.authorizer.lambda.userId;
  try {
    const videos = await prisma.video.findMany({
      where: { userId },
      select: { filename: true },
    });

    const s3Keys = videos.map(v => v.filename).filter(Boolean);
    if (s3Keys.length > 0) {
      s3.deleteObjects({
        Bucket: process.env.S3_BUCKET_NAME,
        Delete: { Objects: s3Keys.map(Key => ({ Key })) },
      }, (err) => {
        if (err) console.error('Failed to delete from S3:', err);
      });
    }

    await prisma.video.deleteMany({ where: { userId } });

    return response(200, {
      success: true,
      message: 'Your prompt history and associated videos have been cleared.',
    });
  } catch (err) {
    console.error(err);
    return response(500, { error: 'Failed to clear history' });
  }
};
