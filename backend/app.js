// backend/app.js
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');     // Signup/Login
const userRoutes = require('./routes/user');     // Authenticated user actions (generate/compile/videos)

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

// Public routes
app.use('/auth', authRoutes);

// Static video access (for dev use only — protect in prod!)
app.use('/videos', express.static(__dirname + '/generated/media/videos/'));

// Authenticated user actions
app.use('/user', userRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
