const express = require('express');
const { Notification } = require('../models');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const notifications = await Notification.find({ user_id: req.user.id }).sort({ created_at: -1 });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { is_read: true });
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
