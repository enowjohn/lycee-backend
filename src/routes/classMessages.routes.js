const express = require('express');
const { ClassMessage } = require('../models');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

router.get('/:classLevel', authenticateToken, async (req, res) => {
  try {
    const messages = await ClassMessage.find({ class_level: req.params.classLevel }).sort({ created_at: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
