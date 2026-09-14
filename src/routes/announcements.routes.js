const express = require('express');
const { Announcement, User, Notification } = require('../models');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .sort({ created_at: -1 })
      .limit(10)
      .populate('author_id', 'first_name last_name');

    res.json(announcements.map((a) => {
      const json = a.toJSON();
      const author = json.author_id;
      return {
        ...json,
        author_id: author && author.id ? author.id : author,
        author_first_name: author && author.first_name,
        author_last_name: author && author.last_name
      };
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, content, priority } = req.body;

    const announcement = await Announcement.create({ title, content, author_id: req.user.id, priority });

    const users = await User.find({}, '_id');
    await Notification.insertMany(users.map((user) => ({
      user_id: user._id,
      title,
      message: content.substring(0, 100),
      type: 'announcement'
    })));

    res.status(201).json({ id: announcement._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
