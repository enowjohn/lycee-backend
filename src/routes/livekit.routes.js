const express = require('express');
const { AccessToken } = require('livekit-server-sdk');
const { VideoSession } = require('../models');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Mints a LiveKit access token so the caller can join the room for a
// scheduled video session. LiveKit Cloud auto-creates the room on first
// join, so no separate RoomServiceClient call is needed for a basic join.
router.post('/token', authenticateToken, async (req, res) => {
  try {
    const { session_id } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });
    if (!process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET || !process.env.LIVEKIT_WS_URL) {
      return res.status(500).json({ error: 'LiveKit is not configured on the server' });
    }

    const session = await VideoSession.findById(session_id);
    if (!session) return res.status(404).json({ error: 'Video session not found' });
    if (session.status === 'cancelled') return res.status(400).json({ error: 'This session was cancelled' });

    const identity = req.user.id;
    const name = req.user.email || identity;

    const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
      identity,
      name
    });
    at.addGrant({
      room: session.meeting_id,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    const token = await at.toJwt();

    res.json({ token, url: process.env.LIVEKIT_WS_URL, room: session.meeting_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
