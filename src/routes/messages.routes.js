const express = require('express');
const mongoose = require('mongoose');
const { Message, Notification } = require('../models');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// ---- All messages involving the signed-in user ----
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const messages = await Message.find({ $or: [{ sender_id: userId }, { receiver_id: userId }] })
      .sort({ created_at: -1 })
      .populate('sender_id', 'first_name last_name')
      .populate('receiver_id', 'first_name last_name');

    res.json(messages.map((m) => {
      const json = m.toJSON();
      const sender = json.sender_id;
      const receiver = json.receiver_id;
      return {
        ...json,
        sender_id: sender && sender.id ? sender.id : sender,
        sender_first_name: sender && sender.first_name,
        sender_last_name: sender && sender.last_name,
        receiver_id: receiver && receiver.id ? receiver.id : receiver,
        receiver_first_name: receiver && receiver.first_name,
        receiver_last_name: receiver && receiver.last_name
      };
    }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Send a message via REST (the live app normally uses sockets) ----
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { receiver_id, subject, message } = req.body;

    const created = await Message.create({ sender_id: req.user.id, receiver_id, subject, message });

    await Notification.create({
      user_id: receiver_id,
      title: 'New Message',
      message: subject || 'You have a new message',
      type: 'general'
    });

    res.status(201).json({ id: created._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// IMPORTANT: '/conversations' must be registered BEFORE '/:userId',
// otherwise Express matches it as a userId (the old bug that made the
// conversation list empty).
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const currentUserId = new mongoose.Types.ObjectId(req.user.id);

    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ sender_id: currentUserId }, { receiver_id: currentUserId }]
        }
      },
      {
        $addFields: {
          other_user_id: {
            $cond: [{ $eq: ['$sender_id', currentUserId] }, '$receiver_id', '$sender_id']
          }
        }
      },
      { $sort: { created_at: -1 } },
      {
        $group: {
          _id: '$other_user_id',
          last_message: { $first: '$message' },
          last_message_time: { $first: '$created_at' }
        }
      },
      { $sort: { last_message_time: -1 } },
      {
        $project: {
          _id: 0,
          other_user_id: '$_id',
          last_message: 1,
          last_message_time: 1
        }
      }
    ]);

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ---- Full thread with one contact ----
router.get('/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;

    const messages = await Message.find({
      $or: [
        { sender_id: currentUserId, receiver_id: userId },
        { sender_id: userId, receiver_id: currentUserId }
      ]
    }).sort({ created_at: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
