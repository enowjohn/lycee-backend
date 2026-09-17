const express = require('express');
const { Subject } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const subjects = await Subject.find();
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { name, code, stream, class_level, description } = req.body;
    const subject = await Subject.create({ name, code, stream, class_level, description });
    res.status(201).json(subject);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
