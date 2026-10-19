const express = require('express');
const crypto = require('crypto');
const { VideoSession, Teacher, Notification, User } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

function flattenSession(session) {
  const json = session.toJSON();
  const subject = json.subject_id;
  const teacher = json.teacher_id;
  return {
    ...json,
    subject_id: subject && subject.id ? subject.id : subject,
    subject_name: subject && subject.name,
    teacher_id: teacher && teacher.id ? teacher.id : teacher,
    teacher_first_name: teacher && teacher.first_name,
    teacher_last_name: teacher && teacher.last_name
  };
}

router.get('/', authenticateToken, async (req, res) => {
  try {
    const { class_level, subject_id } = req.query;
    const filter = { status: { $ne: 'cancelled' } };
    if (class_level) filter.class_level = class_level;
    if (subject_id) filter.subject_id = subject_id;

    const sessions = await VideoSession.find(filter)
      .sort({ scheduled_date: 1 })
      .populate('subject_id', 'name')
      .populate('teacher_id', 'first_name last_name');

    res.json(sessions.map(flattenSession));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, requireRole('teacher', 'admin'), async (req, res) => {
  try {
    const { title, description, subject_id, class_level, scheduled_date, duration } = req.body;

    // Resolve the teacher from the logged-in user instead of trusting a
    // client-supplied teacher_id, which would let anyone schedule a
    // session under someone else's name. If the account has no teacher
    // profile yet (e.g. a freshly registered teacher, or an admin hosting a
    // class), create one on the fly so "Create Session" is not a dead end.
    let teacher = await Teacher.findOne({ user_id: req.user.id });
    if (!teacher) {
      const account = await User.findById(req.user.id).select('first_name last_name email');
      if (!account) {
        return res.status(403).json({ error: 'Your account could not be found. Please log in again.' });
      }
      teacher = await Teacher.create({
        user_id: account._id,
        teacher_id: 'TCH' + Date.now().toString(36).toUpperCase(),
        first_name: account.first_name || 'Teacher',
        last_name: account.last_name || 'Staff',
        subject: 'General',
        email: account.email
      });
    }

    const meeting_id = 'session_' + Date.now() + '_' + crypto.randomBytes(5).toString('hex');

    const session = await VideoSession.create({
      title, description, teacher_id: teacher._id, subject_id: subject_id || null, class_level, scheduled_date, duration, meeting_id
    });

    res.status(201).json({ id: session._id, meeting_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Add people to a class (Google-Meet-style invites) ----
// Creates an in-app notification for each invitee and pushes a real-time
// 'live-invite' event so anyone online sees it immediately.
router.post('/:meetingId/invite', authenticateToken, async (req, res) => {
  try {
    const { userIds } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: 'Select at least one person to invite.' });
    }

    const session = await VideoSession.findOne({ meeting_id: req.params.meetingId });
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const base = (process.env.FRONTEND_URL || 'https://gbhsombessa.site')
      .split(',')[0]
      .trim()
      .replace(/\/$/, '');
    const link = `${base}/live-class?meetingId=${encodeURIComponent(session.meeting_id)}`;

    const io = req.app.get('io');
    const invited = [];

    for (const userId of userIds) {
      // Skip malformed ids instead of failing the whole batch.
      if (!userId || !String(userId).match(/^[a-f0-9]{24}$/i)) continue;

      await Notification.create({
        user_id: userId,
        title: 'Live class invitation',
        message: `You are invited to "${session.title}". Join here: ${link}`,
        type: 'live'
      });

      invited.push(String(userId));
      io?.to(String(userId)).emit('live-invite', {
        meetingId: session.meeting_id,
        title: session.title,
        classLevel: session.class_level,
        link,
        invitedBy: req.user.email
      });
    }

    res.json({ invited: invited.length, link });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status, recording_url } = req.body;
    await VideoSession.findByIdAndUpdate(req.params.id, { status, recording_url });
    res.json({ message: 'Session status updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
