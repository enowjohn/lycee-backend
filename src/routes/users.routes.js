const express = require('express');
const { User } = require('../models');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Directory of people a signed-in user can message or invite to a class.
// Never exposes passwords or other private fields.
router.get('/', authenticateToken, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } })
      .select('first_name last_name email role')
      .sort({ first_name: 1, last_name: 1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
