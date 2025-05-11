// backend/routes/user.js
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const authenticateToken = require('../middleware/auth');
const axios = require('axios');
const AWS = require('aws-sdk');

const prisma = new PrismaClient();
const router = express.Router();

const openai = require('../lib/openaiClient');

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});


// GET /user/videos
router.get('/videos', authenticateToken, async (req, res) => {
  const videos = await prisma.video.findMany({
    where: { userId: req.user.userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, prompt: true, filename: true, createdAt: true },
  });
  res.json(videos);
});

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

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.7
  });

  const script = response.choices[0].message.content.trim();

  // Remove accidental markdown/code fences
  return script
    .replace(/^```python/, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();
}


// POST /user/generate
router.post('/generate', authenticateToken, async (req, res) => {
  const { prompt } = req.body;
  const userId = req.user.userId;

  const script = await generateManimScript(prompt);

  const video = await prisma.video.create({
    data: {
      userId,
      prompt,
      script,
      filename: '', // will be updated after compile
    },
  });

  res.json({ success: true, script, videoId: video.id });
});

function extractSceneName(script) {
  // Match: class MySceneName(Scene) or (ThreeDScene), etc.
  const match = script.match(/class\s+(\w+)\s*\(\s*[\w.]*Scene\s*\)/);
  return match ? match[1] : null;
}

// POST /user/compile
router.post('/compile', authenticateToken, async (req, res) => {
  const { videoId } = req.body;
  const userId = req.user.userId;

  try {
    // 1️⃣ Fetch the script from the database
    const video = await prisma.video.findUnique({ where: { id: videoId } });

    if (!video || video.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized or video not found' });
    }

    // 2️⃣ Dynamically extract the scene name
    const sceneName = extractSceneName(video.script);

    if (!sceneName) {
      return res.status(400).json({ error: 'No scene class found in the script!' });
    }

    // 3️⃣ Send render request to Python service
    const response = await axios.post('http://localhost:8001/render', {
      videoId: video.id,
      script: video.script,
      sceneName: sceneName
    });

    if (!response || !response.data.success) {
      return res.status(500).json({ error: 'Rendering failed', details: response.data.error });
    }

    const { filename } = response.data;

    // 4️⃣ Generate Streaming URL (for `<video>` tag)
    const s3StreamParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: filename,
      Expires: 3600 // 1 hour
    };

    const streamingUrl = s3.getSignedUrl('getObject', s3StreamParams);

    // 5️⃣ Generate Download URL (forces download)
    const s3DownloadParams = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: filename,
      Expires: 3600,
      ResponseContentDisposition: `attachment; filename="${filename.split('/').pop()}"`
    };

    const downloadUrl = s3.getSignedUrl('getObject', s3DownloadParams);

    // 6️⃣ Update the video's filename in DB
    await prisma.video.update({
      where: { id: video.id },
      data: { filename: filename },
    });

    // 7️⃣ Return both URLs to the client
    res.status(200).json({
      success: true,
      videoUrl: streamingUrl,
      downloadUrl: downloadUrl
    });

  } catch (err) {
    console.log(err.message || err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
module.exports = router;

// GET /user/prompts
router.get('/prompts', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const prompts = await prisma.video.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },  // oldest → newest for chat flow
      select: {
        id: true,         // videoId
        prompt: true,
        createdAt: true,
        filename: true    // optional: check if compiled
      }
    });

    res.status(200).json(prompts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch prompt history' });
  }
});

// routes/user.js
router.get('/code', authenticateToken, async (req, res) => {
  const { videoId } = req.query;
  const userId = req.user.userId;

  if (!videoId) {
    return res.status(400).json({ error: 'videoId is required' });
  }

  try {
    // Fetch the script from the database
    const video = await prisma.video.findUnique({
      where: { id: videoId },
    });

    // Validate the user owns the script
    if (!video || video.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized or script not found' });
    }

    res.status(200).json({
      success: true,
      script: video.script
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve script' });
  }
});




router.delete('/clear-history', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    // Fetch all video records for the user
    const videos = await prisma.video.findMany({
      where: { userId },
      select: { filename: true }
    });

    // If you are storing the full S3 URL in `filename`, extract the key:
    const s3Keys = videos.map(video => video.filename);

    // 🚀 Optional: Remove from S3 if you want (asynchronous)
    if (s3Keys.length > 0) {
      const deleteParams = {
        Bucket: process.env.S3_BUCKET_NAME,
        Delete: {
          Objects: s3Keys.map(key => ({ Key: key }))
        }
      };
      
      s3.deleteObjects(deleteParams, (err, data) => {
        if (err) {
          console.error("Failed to delete from S3:", err);
        } else {
          console.log("Deleted from S3:", data);
        }
      });
    }

    // 🚀 Step 2: Remove all video records from the database
    await prisma.video.deleteMany({
      where: { userId },
    });

    res.status(200).json({
      success: true,
      message: 'Your prompt history and associated videos have been cleared.',
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to clear history' });
  }
});



module.exports = router;


