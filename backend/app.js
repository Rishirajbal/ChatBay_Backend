import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors"; 

const port = process.env.PORT || 3000;
const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";
const app = express();

// Store active users and their socket IDs
const activeUsers = new Map();
// Store room information
const rooms = new Map();
// Store private chat rooms
const privateChats = new Map();

app.use(cors({
  origin: clientUrl,
  methods: ["GET", "POST", "DELETE"],
  credentials: true
}));

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: clientUrl,
    methods: ["GET", "POST", "DELETE"],
    credentials: true
  }
});

app.get('/', (req, res) => {
  res.send('Chat Server is running');
});

// Test endpoint for debugging
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'Server is working', 
    timestamp: new Date().toISOString(),
    activeUsers: activeUsers.size,
    rooms: rooms.size
  });
});

// API endpoints for room management
app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.keys()).map(roomName => ({
    name: roomName,
    participants: rooms.get(roomName).participants.length,
    isPrivate: false
  }));
  res.json(roomList);
});

app.post('/api/rooms', express.json(), (req, res) => {
  const { roomName, createdBy } = req.body;
  if (rooms.has(roomName)) {
    return res.status(400).json({ error: 'Room already exists' });
  }
  
  rooms.set(roomName, {
    participants: [createdBy],
    messages: [],
    createdBy,
    createdAt: new Date()
  });
  
  // Notify all clients about the new room
  io.emit('room_created', {
    name: roomName,
    participants: 1,
    isPrivate: false,
    createdBy: createdBy
  });
  
  res.json({ success: true, roomName, createdBy });
});

app.delete('/api/rooms/:roomName', express.json(), (req, res) => {
  const { roomName } = req.params;
  const { deletedBy, isMaster, username } = req.body;
  
  console.log('DELETE /api/rooms/:roomName called');
  console.log('Room name:', roomName);
  console.log('Request body:', req.body);
  console.log('Active users:', Array.from(activeUsers.keys()));
  console.log('Available rooms:', Array.from(rooms.keys()));
  
  if (!rooms.has(roomName)) {
    console.log('Room not found:', roomName);
    return res.status(404).json({ error: 'Room not found' });
  }
  
  const user = activeUsers.get(deletedBy);
  console.log('User found:', user);
  
  // Check permissions: Only master account can delete rooms
  const isMasterAccount = isMaster || (user && user.isMaster);
  console.log('Is master account:', isMasterAccount);
  
  if (!isMasterAccount) {
    console.log('Permission denied - not master account');
    return res.status(403).json({ error: 'Only master account can delete rooms' });
  }
  
  // Remove room
  rooms.delete(roomName);
  console.log('Room deleted successfully:', roomName);
  
  // Notify all clients about the deleted room
  io.emit('room_deleted', { roomName });
  
  // Kick all users out of the deleted room
  io.to(roomName).emit('room_deleted_notification', { 
    roomName, 
    message: `Room "${roomName}" has been deleted by master account.` 
  });
  
  res.json({ success: true, roomName });
});

httpServer.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle user login
  socket.on('user_login', (userData) => {
    const { username, userId, isMaster } = userData;
    activeUsers.set(userId, {
      socketId: socket.id,
      username,
      userId,
      isMaster: isMaster || false,
      currentRoom: null
    });
    
    socket.userId = userId;
    socket.username = username;
    socket.isMaster = isMaster || false;
    
    // Notify all clients about new user
    io.emit('user_list_updated', Array.from(activeUsers.values()));
    console.log(`User ${username} logged in${isMaster ? ' (Master Account)' : ''}`);
  });

  // Handle joining a room
  socket.on('join_room', (data) => {
    const { roomName, userId } = data;
    const user = activeUsers.get(userId);
    
    if (!user) return;
    
    // Leave current room if any
    if (user.currentRoom) {
      socket.leave(user.currentRoom);
      if (rooms.has(user.currentRoom)) {
        const room = rooms.get(user.currentRoom);
        room.participants = room.participants.filter(p => p !== userId);
      }
    }
    
    // Join new room
    socket.join(roomName);
    user.currentRoom = roomName;
    
    // Add user to room if it exists, create if it doesn't
    if (!rooms.has(roomName)) {
      rooms.set(roomName, {
        participants: [userId],
        messages: [],
        createdBy: userId,
        createdAt: new Date()
      });
    } else {
      const room = rooms.get(roomName);
      if (!room.participants.includes(userId)) {
        room.participants.push(userId);
      }
    }
    
    // Send room info to the user
    const room = rooms.get(roomName);
    socket.emit('room_joined', {
      roomName,
      participants: room.participants.map(p => activeUsers.get(p)?.username || 'Unknown'),
      messages: room.messages
    });
    
    // Notify others in the room
    socket.to(roomName).emit('user_joined_room', {
      username: user.username,
      roomName
    });
    
    console.log(`${user.username} joined room: ${roomName}`);
  });

  // Handle group chat messages
  socket.on('group_message', (data) => {
    const { roomName, message, userId } = data;
    const user = activeUsers.get(userId);
    
    if (!user || !rooms.has(roomName)) return;
    
    const messageData = {
      id: Date.now().toString(),
      text: message,
      sender: user.username,
      senderId: userId,
      roomName,
      timestamp: new Date().toISOString(),
      type: 'group'
    };
    
    // Store message in room
    const room = rooms.get(roomName);
    room.messages.push(messageData);
    
    // Broadcast to all users in the room
    io.to(roomName).emit('new_group_message', messageData);
    
    console.log(`Group message in ${roomName}: ${user.username}: ${message}`);
  });

  // Handle private messages
  socket.on('private_message', (data) => {
    const { recipientId, message, senderId } = data;
    const sender = activeUsers.get(senderId);
    const recipient = activeUsers.get(recipientId);
    
    if (!sender || !recipient) return;
    
    // Create or get private chat room
    const chatId = [senderId, recipientId].sort().join('_');
    if (!privateChats.has(chatId)) {
      privateChats.set(chatId, {
        participants: [senderId, recipientId],
        messages: []
      });
    }
    
    const messageData = {
      id: Date.now().toString(),
      text: message,
      sender: sender.username,
      senderId,
      recipientId,
      timestamp: new Date().toISOString(),
      type: 'private'
    };
    
    // Store message
    const chat = privateChats.get(chatId);
    chat.messages.push(messageData);
    
    // Send to recipient
    const recipientSocketId = recipient.socketId;
    io.to(recipientSocketId).emit('new_private_message', messageData);
    
    // Send back to sender for confirmation
    socket.emit('private_message_sent', messageData);
    
    console.log(`Private message: ${sender.username} -> ${recipient.username}: ${message}`);
  });

  // Handle typing indicators
  socket.on('typing_start', (data) => {
    const { roomName, userId } = data;
    const user = activeUsers.get(userId);
    if (user && roomName) {
      socket.to(roomName).emit('user_typing', {
        username: user.username,
        roomName
      });
    }
  });

  socket.on('typing_stop', (data) => {
    const { roomName, userId } = data;
    const user = activeUsers.get(userId);
    if (user && roomName) {
      socket.to(roomName).emit('user_stopped_typing', {
        username: user.username,
        roomName
      });
    }
  });

  // Handle getting private chat history
  socket.on('get_private_chat', (data) => {
    const { otherUserId, userId } = data;
    const chatId = [userId, otherUserId].sort().join('_');
    
    if (privateChats.has(chatId)) {
      const chat = privateChats.get(chatId);
      socket.emit('private_chat_history', {
        chatId,
        messages: chat.messages,
        otherUserId
      });
    } else {
      socket.emit('private_chat_history', {
        chatId,
        messages: [],
        otherUserId
      });
    }
  });

  // Handle leaving room
  socket.on('leave_room', (data) => {
    const { roomName, userId } = data;
    const user = activeUsers.get(userId);
    
    if (user && user.currentRoom === roomName) {
      socket.leave(roomName);
      user.currentRoom = null;
      
      if (rooms.has(roomName)) {
        const room = rooms.get(roomName);
        room.participants = room.participants.filter(p => p !== userId);
        
        // Notify others in the room
        socket.to(roomName).emit('user_left_room', {
          username: user.username,
          roomName
        });
      }
      
      console.log(`${user.username} left room: ${roomName}`);
    }
  });

  socket.on('disconnect', () => {
    const userId = socket.userId;
    if (userId && activeUsers.has(userId)) {
      const user = activeUsers.get(userId);
      console.log(`User ${user.username} disconnected`);
      
      // Remove from current room
      if (user.currentRoom && rooms.has(user.currentRoom)) {
        const room = rooms.get(user.currentRoom);
        room.participants = room.participants.filter(p => p !== userId);
        socket.to(user.currentRoom).emit('user_left_room', {
          username: user.username,
          roomName: user.currentRoom
        });
      }
      
      // Remove from active users
      activeUsers.delete(userId);
      
      // Notify all clients about user list update
      io.emit('user_list_updated', Array.from(activeUsers.values()));
    }
  });
});
