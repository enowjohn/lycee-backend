const http = require('http');
const socketIo = require('socket.io');
const app = require('./app');
require('./db/connection'); // opens the MongoDB connection
const registerSocketHandlers = require('./sockets');

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || process.env.CLIENTURL || process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.set('io', io);
registerSocketHandlers(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = server;
