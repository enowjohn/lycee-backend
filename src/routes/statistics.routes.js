const express = require('express');
const { Student, Teacher, Subject, VideoSession } = require('../models');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const [students, teachers, subjects, sessions] = await Promise.all([
      Student.countDocuments({ status: 'active' }),
      Teacher.countDocuments({ status: 'active' }),
      Subject.countDocuments(),
      VideoSession.countDocuments({ status: 'scheduled' })
    ]);

    res.json({ students, teachers, subjects, sessions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
