const express = require('express');
const { Attendance } = require('../models');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { student_id, session_id, status } = req.body;
    const attendance = await Attendance.create({ student_id, session_id, join_time: new Date(), status });
    res.status(201).json({ id: attendance._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { leave_time, duration } = req.body;
    await Attendance.findByIdAndUpdate(req.params.id, { leave_time, duration });
    res.json({ message: 'Attendance updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
