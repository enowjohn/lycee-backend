const express = require('express');
const { Gallery } = require('../models');
const authenticateToken = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = {};
    if (category) filter.category = category;

    const items = await Gallery.find(filter).sort({ created_at: -1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { title, description, category } = req.body;
    const file_type = req.file.mimetype.startsWith('video') ? 'video' : 'image';

    const item = await Gallery.create({
      title, description, file_path: req.file.filename, file_type, category, uploaded_by: req.user.id
    });

    res.status(201).json({ id: item._id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
