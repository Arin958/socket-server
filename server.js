// backend/server.js - ENHANCED VERSION
const dotenv = require('dotenv');
dotenv.config();
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000" || 'http://192.168.0.103:3000',
    methods: ["GET", "POST"],
  }
});

console.log(process.env.FRONTEND_URL, "frontendUrl");

// Enhanced room storage
const rooms = new Map(); // roomId -> Room object
const socketToRoom = new Map(); // socketId -> roomId
const socketToUser = new Map(); // socketId -> userData
console.log(rooms, "roomsMap");
console.log(socketToRoom, "socketToRoomMap");
console.log(socketToUser, "socketToUserMap");

class RoomManager {
  static createRoom(roomId, userId, userName) {
    const room = {
      id: roomId,
      userName: userName,
      host: userId,
      participants: new Map(), // socketId -> userData
      createdAt: new Date(),
      isLocked: false,
      password: null
    };
    console.log(roomId,"roomId")
    console.log(room,"roomData")
    rooms.set(roomId, room);
    return room;
  }

static getRoom(roomId) {
    const upperId = roomId.toUpperCase(); // Always uppercase
    return rooms.get(upperId);
}

static joinRoom(roomId, socketId, userData) {
    const upperId = roomId.toUpperCase(); // Always uppercase
    const room = rooms.get(upperId);
    if (!room) return null;
    
    room.participants.set(socketId, userData);
    socketToRoom.set(socketId, upperId); // Store uppercase ID
    socketToUser.set(socketId, userData);
    
    return room;
}

  static leaveRoom(socketId) {
    const roomId = socketToRoom.get(socketId);
    if (!roomId) return null;
    
    const room = rooms.get(roomId);
    if (!room) return null;
    
    room.participants.delete(socketId);
    socketToRoom.delete(socketId);
    socketToUser.delete(socketId);
    
    // Clean up empty rooms
  setTimeout(() => {
  if (room.participants.length === 0) {
    delete rooms[roomId];
  }
}, 10_000); 
    
    return roomId;
  }

static getParticipants(roomId) {
    const upperId = roomId.toUpperCase(); // Always uppercase
    const room = rooms.get(upperId);
    if (!room) return [];
    
    return Array.from(room.participants.entries()).map(([socketId, userData]) => ({
        socketId,
        ...userData
    }));
}
}

// Room ID generation system
const generateRoomId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
};

// Event handlers
io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);
  
  // 1. CREATE ROOM
socket.on('create-room', (data, callback) => {
  try {
    console.log('CREATE ROOM DATA:', data);

    const { userName } = data;

    if (!userName || !userName.trim()) {
      return callback({
        success: false,
        error: 'Username is required',
      });
    }

    const userId = `user_${Date.now()}`;
    const roomId = generateRoomId();

        console.log('🔍🔍🔍 DEBUG CREATE-ROOM 🔍🔍🔍');
    console.log('Created room ID:', roomId);
    console.log('User:', userName);
    console.log('Socket ID:', socket.id);

    const userData = {
      userId,
      socketId: socket.id,
      userName,
      isVideoOn: true,
      isAudioOn: true,
      isScreenSharing: false,
      isHost: true,
    };

    RoomManager.createRoom(roomId, userId, userName);
    RoomManager.joinRoom(roomId, socket.id, userData);

    console.log('Room created', roomId, userData);
    console.log(`🏠 Room created: ${roomId} by ${userName}`);

     console.log('All rooms after creation:', Array.from(rooms.keys()));

    callback({
      success: true,
      roomId,
      userId,
      userName, // ✅ return it
      isHost: true,
      participants: [userData], // ✅ include host
    });
  } catch (error) {
    console.error('Error creating room:', error);
    callback({
      success: false,
      error: 'Failed to create room',
    });
  }
});

  
  // 2. JOIN ROOM
  socket.on('join-room', ({ roomId, userName, password }, callback) => {
    try {
    // CRITICAL DEBUG LOGS
    console.log('🔍🔍🔍 DEBUG JOIN-ROOM START 🔍🔍🔍');
    console.log('Room ID from client:', roomId);
    console.log('Socket ID:', socket.id);
    console.log('All existing rooms:', Array.from(rooms.keys()));
    
    // Normalize room ID to uppercase
    const normalizedRoomId = roomId.toUpperCase();
    console.log('Normalized room ID:', normalizedRoomId);
    
    const room = RoomManager.getRoom(normalizedRoomId);
    console.log('Room found:', room);
    console.log('Room participants:', room ? Array.from(room.participants.keys()) : 'NO ROOM');
    
    if (!room) {
      console.log('❌ ROOM NOT FOUND - Available rooms:', Array.from(rooms.keys()));
      if (callback) {
        callback({ success: false, error: 'Room not found' });
      }
      return;
    }
      
      if (room.isLocked && room.password !== password) {
        if (callback) {
          callback({ success: false, error: 'Incorrect password' });
        }
        return;
      }
      
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const existingParticipants = RoomManager.getParticipants(normalizedRoomId);
      
      const userData = {
        userId,
        socketId: socket.id,
        userName,
        isVideoOn: true,
        isAudioOn: true,
        isScreenSharing: false,
        isHost: false
      };
      
        RoomManager.joinRoom(normalizedRoomId, socket.id, userData);
        socket.join(normalizedRoomId);
      
      console.log(`🚪 ${userName} joined room ${normalizedRoomId}`);
      
      // Notify existing participants
      existingParticipants.forEach(participant => {
        io.to(participant.socketId).emit('user-joining', {
          userId,
          userName,
          socketId: socket.id
        });
      });
      
      if (callback) {
        callback({
          success: true,
          roomId: normalizedRoomId,
          userId,
          isHost: false,
          participants: existingParticipants.map(p => ({
            userId: p.userId,
            userName: p.userName,
            socketId: p.socketId,
            isVideoOn: p.isVideoOn,
            isAudioOn: p.isAudioOn
          }))
        });
      }
      
      // Notify room about new user (after callback)
      socket.to(normalizedRoomId).emit('user-joined', {
        userId,
        userName,
        socketId: socket.id,
        isVideoOn: true,
        isAudioOn: true
      });
      console.log(`📤 user-joined event sent to room ${normalizedRoomId}`, {
    event: 'user-joined',
    toRoom: normalizedRoomId,
    userId: userId,
    userName: userName,
    socketId: socket.id,
    roomParticipants: Array.from(room.participants.keys())
});

const socketRoom = io.sockets.adapter.rooms.get(normalizedRoomId);
console.log('👥 Sockets in room:', socketRoom ? Array.from(socketRoom) : 'No one');
    } catch (error) {
      console.error('Error joining room:', error);
      if (callback) {
        callback({ success: false, error: 'Failed to join room' });
      }
    }
  });
  
  // 3. WEBRTC SIGNALING
  socket.on('webrtc-offer', ({ to, offer, from }) => {
    console.log(`📨 WebRTC offer from ${from} to ${to}`);
    socket.to(to).emit('webrtc-offer', { offer, from });
  });
  
  socket.on('webrtc-answer', ({ to, answer, from }) => {
    console.log(`📨 WebRTC answer from ${from} to ${to}`);
    socket.to(to).emit('webrtc-answer', { answer, from });
  });
  
  socket.on('webrtc-ice-candidate', ({ to, candidate, from }) => {
    socket.to(to).emit('webrtc-ice-candidate', { candidate, from });
  });
  
  // 4. MEDIA CONTROL EVENTS
  socket.on('toggle-audio', ({ roomId, userId, state }) => {
    const room = RoomManager.getRoom(roomId);
    if (room && room.participants.has(socket.id)) {
      room.participants.get(socket.id).isAudioOn = state;
      socket.to(roomId).emit('user-audio-toggled', { userId, state });
      console.log(`🎤 ${userId} audio: ${state ? 'ON' : 'OFF'}`);
    }
  });
  
  socket.on('toggle-video', ({ roomId, userId, state }) => {
    const room = RoomManager.getRoom(roomId);
    if (room && room.participants.has(socket.id)) {
      room.participants.get(socket.id).isVideoOn = state;
      socket.to(roomId).emit('user-video-toggled', { userId, state });
      console.log(`📹 ${userId} video: ${state ? 'ON' : 'OFF'}`);
    }
  });
  
  socket.on('start-screen-share', ({ roomId, userId }) => {
    const room = RoomManager.getRoom(roomId);
    if (room && room.participants.has(socket.id)) {
      room.participants.get(socket.id).isScreenSharing = true;
      socket.to(roomId).emit('screen-share-started', { userId, socketId: socket.id });
      console.log(`🖥️ ${userId} started screen sharing`);
    }
  });
  
  socket.on('stop-screen-share', ({ roomId, userId }) => {
    const room = RoomManager.getRoom(roomId);
    if (room && room.participants.has(socket.id)) {
      room.participants.get(socket.id).isScreenSharing = false;
      socket.to(roomId).emit('screen-share-stopped', { userId });
      console.log(`🖥️ ${userId} stopped screen sharing`);
    }
  });
  
  // 5. CHAT SYSTEM
  socket.on('send-chat-message', ({ roomId, userId, userName, message }) => {
    const messageData = {
      id: uuidv4(),
      userId,
      userName,
      message,
      timestamp: new Date().toISOString(),
      type: 'text'
    };
    
    console.log(`💬 ${userName} in ${roomId}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    
    // Broadcast to all in room including sender
    io.to(roomId).emit('new-chat-message', messageData);
  });
  
  // 6. ROOM MANAGEMENT
  socket.on('lock-room', ({ roomId, password }) => {
    const room = RoomManager.getRoom(roomId);
    if (room && room.host === socketToUser.get(socket.id)?.userId) {
      room.isLocked = true;
      room.password = password;
      io.to(roomId).emit('room-locked', { isLocked: true });
      console.log(`🔒 Room ${roomId} locked`);
    }
  });
  
  socket.on('unlock-room', ({ roomId }) => {
    const room = RoomManager.getRoom(roomId);
    if (room && room.host === socketToUser.get(socket.id)?.userId) {
      room.isLocked = false;
      room.password = null;
      io.to(roomId).emit('room-locked', { isLocked: false });
      console.log(`🔓 Room ${roomId} unlocked`);
    }
  });
  
  socket.on('kick-user', ({ roomId, targetUserId }) => {
    const room = RoomManager.getRoom(roomId);
    const user = socketToUser.get(socket.id);
    
    if (room && user?.isHost && user.userId !== targetUserId) {
      // Find socketId of target user
      const targetEntry = Array.from(room.participants.entries())
        .find(([_, u]) => u.userId === targetUserId);
      
      if (targetEntry) {
        const [targetSocketId] = targetEntry;
        io.to(targetSocketId).emit('kicked', { reason: 'Removed by host' });
        io.to(targetSocketId).socketsLeave(roomId);
        
        // Clean up
        room.participants.delete(targetSocketId);
        socketToRoom.delete(targetSocketId);
        socketToUser.delete(targetSocketId);
        
        socket.to(roomId).emit('user-left', { userId: targetUserId });
        console.log(`👢 User ${targetUserId} kicked from ${roomId}`);
      }
    }
  });
  
  // 7. DISCONNECTION HANDLING
  socket.on('leave-room', ({ roomId, userId }) => {
    console.log(`👋 ${userId} leaving room ${roomId}`);
    
    const leftRoomId = RoomManager.leaveRoom(socket.id);
    if (leftRoomId) {
      socket.leave(leftRoomId);
      socket.to(leftRoomId).emit('user-left', { userId });
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);
    
    const leftRoomId = RoomManager.leaveRoom(socket.id);
    if (leftRoomId) {
      socket.to(leftRoomId).emit('user-left', { 
        userId: socketToUser.get(socket.id)?.userId 
      });
    }
  });
  
  // 8. PING FOR CONNECTION HEALTH
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });
});

// Room cleanup interval (remove inactive rooms)
setInterval(() => {
  const now = new Date();
  let cleanedCount = 0;
  
  for (const [roomId, room] of rooms.entries()) {
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    if (room.createdAt < hourAgo && room.participants.size === 0) {
      rooms.delete(roomId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned ${cleanedCount} inactive rooms`);
  }
}, 5 * 60 * 1000); // Every 5 minutes

const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log(`
  🚀 Socket.IO Server Running
  📡 Port: ${PORT}
  🌐 URL: http://localhost:${PORT}
  ⏰ Time: ${new Date().toLocaleTimeString()}
  `);
});