# ChatBay Backend

Real-time chat application backend built with Node.js, Express, and Socket.IO.
**Backend activation**:[ChatBay Backend](https://chatbay-backend.onrender.com)
**Frontend activation**:[ChatBay Frontend](https://chatbay.onrender.com)

## Features

- Real-time messaging with Socket.IO
- Group chat functionality
- Private messaging
- User management
- Room management
- Master account system
- Typing indicators
- Connection status monitoring

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **CORS** - Cross-origin resource sharing

## Installation

1. Clone the repository
```bash
git clone <your-backend-repo-url>
cd backend
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp env.example .env
# Edit .env with your configuration
```

4. Start the server
```bash
npm start
```

## Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `CLIENT_URL` - Frontend URL for CORS
- `SOCKET_CORS_ORIGIN` - Socket.IO CORS origin

## API Endpoints

- `GET /api/rooms` - Get all rooms
- `POST /api/rooms` - Create a new room
- `DELETE /api/rooms/:roomName` - Delete a room (master only)
- `GET /api/test` - Test server connectivity

## Socket.IO Events

- `user_login` - User login
- `join_room` - Join a room
- `group_message` - Send group message
- `private_message` - Send private message
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `leave_room` - Leave a room
- `disconnect` - User disconnect

## Deployment

This backend is configured for deployment on Render:

1. Connect your repository to Render
2. Set environment variables in Render dashboard
3. Deploy as a Web Service

## License

MIT 
