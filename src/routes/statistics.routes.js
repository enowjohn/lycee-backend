const express = require('express');
const { Student, Teacher, Subject, VideoSession } = require('../models');

const router = express.Router();

// Public, read-only counters used by the home page. No sensitive data.
router.get('/', async (req, res) => {
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

