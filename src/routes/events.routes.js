const express = require('express');
const { Event } = require('../models');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const events = await Event.find({ event_date: { $gte: new Date(new Date().toDateString()) } })
      .sort({ event_date: 1 })
      .limit(10);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, requireRole('admin', 'teacher'), async (req, res) => {
  try {
    const { title, description, event_date, event_time, location, type } = req.body;
    const event = await Event.create({ title, description, event_date, event_time, location, type });
    res.status(201).json({ id: event._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
