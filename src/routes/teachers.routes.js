const express = require('express');
const { Teacher } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// Must stay registered before any '/:id' route.
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ user_id: req.user.id });
    if (!teacher) return res.status(404).json({ error: 'Teacher profile not found' });
    res.json(teacher);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const teachers = await Teacher.find({ status: 'active' });
    res.json(teachers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, requireRole('teacher', 'admin'), upload.single('photo'), async (req, res) => {
  try {
    const { teacher_id, first_name, last_name, subject, department, phone, email, qualification, hire_date } = req.body;
    const photo = req.file ? req.file.filename : null;

    const teacher = await Teacher.create({
      user_id: req.user.id,
      teacher_id, first_name, last_name, subject, department, phone, email, qualification, photo, hire_date
    });

    res.status(201).json(teacher);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
