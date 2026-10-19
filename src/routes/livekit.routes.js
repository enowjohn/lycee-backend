const express = require('express');
const { VideoSession, User } = require('../models');
const authenticateToken = require('../middleware/auth');
const { roomService, roomNameFor, buildToken, LIVEKIT_WS_URL } = require('../services/livekit');

const router = express.Router();

// ---- Join a class session: issue a LiveKit token ----
// Everyone in the class may publish (Meet-style); the client starts the
// teacher on camera automatically and lets students enable theirs.
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

    // Friendly display name for the video tile (the JWT only carries email).
    const dbUser = await User.findById(req.user.id).select('first_name last_name email');
    const displayName = dbUser
      ? `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.trim() || dbUser.email
      : req.user.email;

    const token = await buildToken({
      identity,
      name: displayName,
      roomName,
      // Everyone in a class may publish (turn on mic/camera) — Meet-style.
      canPublish: true
    });

    if (isTeacher && session.status === 'scheduled') {
      await VideoSession.findByIdAndUpdate(session._id, { status: 'live' });
      // Let the whole class know in real time that the lesson started.
      req.app.get('io')
        ?.to(`class_${session.class_level}`)
        .emit('session-live', {
          meetingId: session.meeting_id,
          title: session.title,
          classLevel: session.class_level
        });
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
    if (!session.teacher_id || String(session.teacher_id.user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Only the session teacher can promote participants' });
    }

    const roomName = roomNameFor(meetingId);
    const identity = `user-${studentUserId}`;

    await roomService.updateParticipant(roomName, identity, {
      permission: { canPublish: true, canSubscribe: true, canPublishData: true }
    });

    // Socket.io clients join a room named after the LiveKit room
    // (class_<meetingId>) — see the client's join-session call.
    req.app.get('io')?.to(roomName).emit('livekit-promoted', { identity, userId: studentUserId });
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
    if (!session.teacher_id || String(session.teacher_id.user_id) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Only the session teacher can demote participants' });
    }

    const roomName = roomNameFor(meetingId);
    const identity = `user-${studentUserId}`;

    await roomService.updateParticipant(roomName, identity, {
      permission: { canPublish: false, canSubscribe: true, canPublishData: true }
    });

    req.app.get('io')?.to(roomName).emit('livekit-demoted', { identity, userId: studentUserId });
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
    if (!session.teacher_id || String(session.teacher_id.user_id) !== String(req.user.id)) {
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
