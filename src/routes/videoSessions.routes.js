const express = require('express');
const crypto = require('crypto');
const { VideoSession, Teacher } = require('../models');
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
    // session under someone else's name.
    const teacher = await Teacher.findOne({ user_id: req.user.id });
    if (!teacher) {
      return res.status(403).json({ error: 'Only teachers can create sessions. Please complete your teacher profile first.' });
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
