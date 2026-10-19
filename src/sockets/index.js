const { Message, ClassMessage } = require('../models');

function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Video session rooms
    socket.on('join-session', (sessionId) => {
      socket.join(sessionId);
      console.log(`User joined session: ${sessionId}`);
    });

    socket.on('leave-session', (sessionId) => {
      socket.leave(sessionId);
      console.log(`User left session: ${sessionId}`);
    });

    socket.on('session-message', (data) => {
      io.to(data.sessionId).emit('session-message', data);
    });

    socket.on('raise-hand', (data) => {
      io.to(data.sessionId).emit('raise-hand', data);
      // The class UI listens for 'hand-raised' to show the teacher a list.
      io.to(data.sessionId).emit('hand-raised', data);
    });

    socket.on('new-poll', (data) => {
      socket.to(data.sessionId).emit('new-poll', data);
    });

    socket.on('poll-response', (data) => {
      io.to(data.sessionId).emit('poll-response', data);
    });

    socket.on('screen-share', (data) => {
      socket.to(data.sessionId).emit('screen-share', data);
    });

    // "X is typing." relayed to the recipient's personal room.
    socket.on('typing', (data) => {
      if (!data) return;
      if (data.receiverId) {
        io.to(String(data.receiverId)).emit('typing', data);
      } else if (data.classLevel) {
        socket.to(`class_${data.classLevel}`).emit('typing', data);
      }
    });

    // Private messaging room
    socket.on('join', (userId) => {
      socket.join(userId);
      console.log(`User ${userId} joined their room`);
    });

    socket.on('private_message', async (data) => {
      const { senderId, receiverId, message, senderName } = data;

      try {
        const saved = await Message.create({ sender_id: senderId, receiver_id: receiverId, message, sender_name: senderName });

        const payload = {
          id: saved._id,
          sender_id: senderId,
          receiver_id: receiverId,
          message,
          sender_name: senderName,
          created_at: saved.created_at.toISOString()
        };

        io.to(receiverId).emit('receive_message', payload);
        socket.emit('message_sent', payload);
      } catch (err) {
        console.error('Error storing message:', err);
      }
    });

    // Class-wide messaging room
    socket.on('join_class', (classLevel) => {
      socket.join(`class_${classLevel}`);
      console.log(`User joined class room: class_${classLevel}`);
    });

    socket.on('class_message', async (data) => {
      const { senderId, classLevel, message, senderName } = data;

      try {
        const saved = await ClassMessage.create({ sender_id: senderId, class_level: classLevel, message, sender_name: senderName });

        io.to(`class_${classLevel}`).emit('receive_class_message', {
          id: saved._id,
          sender_id: senderId,
          class_level: classLevel,
          message,
          sender_name: senderName,
          created_at: saved.created_at.toISOString()
        });
      } catch (err) {
        console.error('Error storing class message:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
}

module.exports = registerSocketHandlers;
