const express = require('express');
const cors = require('cors');
const path = require('path');

const { Student, VideoSession, Attendance } = require('./models');
const { webhookReceiver } = require('./services/livekit');

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

// LiveKit webhook: real join/leave events -> attendance records.
// IMPORTANT: needs the RAW request body to verify LiveKit's signature, so
// it's registered with express.raw() BEFORE express.json() runs below. If
// this route is ever moved after express.json(), signature verification
// will start failing because the body will already be a parsed object.
app.post('/api/livekit/webhook', express.raw({ type: 'application/webhook+json' }), async (req, res) => {
  try {
    const event = await webhookReceiver.receive(req.body, req.get('Authorization'));
    const userId = String(event.participant?.identity || '').replace('user-', '');
    const meetingId = String(event.room?.name || '').replace('class_', '');
    if (!userId || !meetingId) return res.status(200).send('ignored');

    const student = await Student.findOne({ user_id: userId });
    if (!student) return res.status(200).send('ignored');

    if (event.event === 'participant_joined') {
      const session = await VideoSession.findOne({ meeting_id: meetingId });
      if (session) {
        await Attendance.create({
          student_id: student._id,
          session_id: session._id,
          join_time: new Date(),
          status: 'present'
        });
      }
    }

    if (event.event === 'participant_left') {
      await Attendance.findOneAndUpdate(
        { student_id: student._id, leave_time: null },
        { leave_time: new Date() },
        { sort: { join_time: -1 } }
      );
    }

    res.status(200).send('ok');
  } catch (error) {
    console.error('LiveKit webhook error:', error);
    res.status(400).send('invalid webhook');
  }
});

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
