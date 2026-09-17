const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const studentsRoutes = require('./routes/students.routes');
const teachersRoutes = require('./routes/teachers.routes');
const subjectsRoutes = require('./routes/subjects.routes');
const marksRoutes = require('./routes/marks.routes');
const messagesRoutes = require('./routes/messages.routes');
const classMessagesRoutes = require('./routes/classMessages.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const announcementsRoutes = require('./routes/announcements.routes');
const eventsRoutes = require('./routes/events.routes');
const videoSessionsRoutes = require('./routes/videoSessions.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const applicationsRoutes = require('./routes/applications.routes');
const galleryRoutes = require('./routes/gallery.routes');
const feesRoutes = require('./routes/fees.routes');
const contactRoutes = require('./routes/contact.routes');
const assignmentsRoutes = require('./routes/assignments.routes');
const statisticsRoutes = require('./routes/statistics.routes');
const aiRoutes = require('./routes/ai.routes');
const livekitRoutes = require('./routes/livekit.routes');

const app = express();

const corsOrigin = process.env.FRONTEND_URL || process.env.CLIENTURL || process.env.CLIENT_URL || 'http://localhost:5173';

app.use(cors({
  origin: [corsOrigin, 'https://lycee-frontend.vercel.app', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/students', studentsRoutes);
app.use('/api/teachers', teachersRoutes);
app.use('/api/subjects', subjectsRoutes);
app.use('/api/marks', marksRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/class-messages', classMessagesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/video-sessions', videoSessionsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/fees', feesRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/statistics', statisticsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/livekit', livekitRoutes);

module.exports = app;
