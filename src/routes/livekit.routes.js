const express = require('express');
const { VideoSession } = require('../models');
const authenticateToken = require('../middleware/auth');
const { roomService, roomNameFor, buildToken, LIVEKIT_WS_URL } = require('../services/livekit');

const router = express.Router();

// ---- Join a class session: issue a role-scoped LiveKit token ----
// Teacher gets canPublish immediately; a student joins view-only and is
// promoted on-camera later via /promote once they raise their hand.
router.post('/join', authenticateToken, async (req, res) => {
  const { meetingId } = req.body;
  if (!meetingId) return res.status(400).json({ error: 'meetingId is required' });

  try {
    const session = await VideoSession.findOne({ meeting_id: meetingId }).populate('teacher_id');
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const roomName = roomNameFor(meetingId);
    const isTeacher = !!session.teacher_id && String(session.teacher_id.user_id) === String(req.user.id);

    // Auto-create the room on first join; a no-op if it already exists.
    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 600,
      maxParticipants: 100,
      metadata: JSON.stringify({ videoSessionId: session._id })
    }).catch(() => {});

    const identity = `user-${req.user.id}`;
    const token = await buildToken({
      identity,
      name: req.user.email,
      roomName,
      canPublish: isTeacher
    });

    if (isTeacher && session.status === 'scheduled') {
      await VideoSession.findByIdAndUpdate(session._id, { status: 'live' });
    }

    res.json({ token, wsUrl: LIVEKIT_WS_URL, roomName, identity, isTeacher });
  } catch (error) {
    console.error('LiveKit join error:', error);
    res.status(500).json({ error: 'Could not create a video session token' });
  }
});

// ---- Teacher promotes a raised hand to on-camera ----
router.post('/promote', authenticateToken, async (req, res) => {
  const { meetingId, studentUserId } = req.body;
  if (!meetingId || !studentUserId) {
    return res.status(400).json({ error: 'meetingId and studentUserId are required' });
  }

  try {
    const session = await VideoSession.findOne({ meeting_id: meetingId }).populate('teacher_id');
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (String(session.teacher_id.user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Only the session teacher can promote participants' });
    }

    const roomName = roomNameFor(meetingId);
    const identity = `user-${studentUserId}`;

    await roomService.updateParticipant(roomName, identity, {
      permission: { canPublish: true, canSubscribe: true, canPublishData: true }
    });

    // Socket.io clients join a room named after the plain meetingId (see
    // sockets/index.js's 'join-session' handler), not the LiveKit room
    // name (which is prefixed with "class_") — emit to that one instead.
    req.app.get('io')?.to(meetingId).emit('livekit-promoted', { identity, userId: studentUserId });
    res.json({ message: 'Promoted to on-camera' });
  } catch (error) {
    console.error('Promote error:', error);
    res.status(500).json({ error: 'Could not promote participant' });
  }
});

// ---- Teacher revokes on-camera access ----
router.post('/demote', authenticateToken, async (req, res) => {
  const { meetingId, studentUserId } = req.body;
  if (!meetingId || !studentUserId) {
    return res.status(400).json({ error: 'meetingId and studentUserId are required' });
  }

  try {
    const session = await VideoSession.findOne({ meeting_id: meetingId }).populate('teacher_id');
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (String(session.teacher_id.user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Only the session teacher can demote participants' });
    }

    const roomName = roomNameFor(meetingId);
    const identity = `user-${studentUserId}`;

    await roomService.updateParticipant(roomName, identity, {
      permission: { canPublish: false, canSubscribe: true, canPublishData: true }
    });

    req.app.get('io')?.to(meetingId).emit('livekit-demoted', { identity, userId: studentUserId });
    res.json({ message: 'Removed from camera' });
  } catch (error) {
    console.error('Demote error:', error);
    res.status(500).json({ error: 'Could not demote participant' });
  }
});

// ---- Teacher ends the session for everyone ----
router.post('/end', authenticateToken, async (req, res) => {
  const { meetingId } = req.body;
  if (!meetingId) return res.status(400).json({ error: 'meetingId is required' });

  try {
    const session = await VideoSession.findOne({ meeting_id: meetingId }).populate('teacher_id');
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (String(session.teacher_id.user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Only the session teacher can end this session' });
    }

    const roomName = roomNameFor(meetingId);
    await roomService.deleteRoom(roomName).catch(() => {}); // disconnects everyone immediately
    await VideoSession.findOneAndUpdate({ meeting_id: meetingId }, { status: 'completed' });
    res.json({ message: 'Session ended' });
  } catch (error) {
    console.error('End session error:', error);
    res.status(500).json({ error: 'Could not end session' });
  }
});

module.exports = router;
