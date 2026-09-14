const mongoose = require('mongoose');
const { applyJsonOptions } = require('./schemaOptions');

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  priority: { type: String, default: 'normal', enum: ['low', 'normal', 'high', 'urgent'] },
  created_at: { type: Date, default: Date.now }
});

applyJsonOptions(announcementSchema);

module.exports = mongoose.model('Announcement', announcementSchema);
