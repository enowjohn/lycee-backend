const { AccessToken, RoomServiceClient, WebhookReceiver } = require('livekit-server-sdk');

// LiveKit is the SFU that actually carries audio/video between
// participants; this backend only issues signed tokens saying who a user
// is and what they're allowed to do in a room (publish camera/mic, or
// view only), and receives webhooks to log attendance.
//
// Required .env vars (LiveKit Cloud: cloud.livekit.io -> create a project):
//   LIVEKIT_WS_URL=wss://<project>.livekit.cloud
//   LIVEKIT_API_KEY=...
//   LIVEKIT_API_SECRET=...

const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL || 'wss://localhost:7880';
const LIVEKIT_HTTP_URL = process.env.LIVEKIT_HTTP_URL || (LIVEKIT_WS_URL.startsWith('wss://') ? LIVEKIT_WS_URL.replace('wss://', 'https://') : LIVEKIT_WS_URL.replace('ws://', 'http://'));
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
  console.warn('LIVEKIT_API_KEY / LIVEKIT_API_SECRET are not set — /api/livekit routes will fail.');
}

const roomService = new RoomServiceClient(LIVEKIT_HTTP_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const webhookReceiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

// The VideoSession.meeting_id doubles as the LiveKit room name.
function roomNameFor(meetingId) {
  return `class_${meetingId}`;
}

async function buildToken({ identity, name, roomName, canPublish }) {
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, { identity, name, ttl: '10h' });
  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: true
  });
  return at.toJwt();
}

module.exports = {
  LIVEKIT_WS_URL,
  roomService,
  webhookReceiver,
  roomNameFor,
  buildToken
};
