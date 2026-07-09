import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GameState, Player, Category, QuestionType, Question } from './src/types';
import { QUESTIONS_LIST } from './src/questions';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Transient media interface
interface TransientMedia {
  senderSlot: 'player1' | 'player2' | 'spectator';
  senderName: string;
  dataUrl: string;
  mediaType: 'image' | 'video' | 'audio';
  timestamp: number;
}

interface AdminMedia {
  id: string;
  senderSlot: 'player1' | 'player2' | 'spectator';
  senderName: string;
  targetSlot: 'player1' | 'player2';
  targetName: string;
  dataUrl: string;
  mediaType: 'image' | 'video' | 'audio';
  timestamp: number;
}

// In-memory database of game rooms and transient media
const rooms: Record<string, GameState> = {};
const transientMediaStore: Record<string, Record<string, TransientMedia>> = {};
const adminMediaStore: Record<string, AdminMedia[]> = {};

// Helper: Generate a unique 4-letter uppercase code
function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars like I, O, 0, 1
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[code]); // Ensure uniqueness
  return code;
}

// Helper: Get random question based on categories and type
function getRandomQuestion(categories: Category[], type: QuestionType, excludeIds: string[] = []): Question | null {
  const filtered = QUESTIONS_LIST.filter(
    (q) => q.type === type && categories.includes(q.category) && !excludeIds.includes(q.id)
  );
  
  // If all are excluded, fallback to any question of this type/category
  const pool = filtered.length > 0 ? filtered : QUESTIONS_LIST.filter(
    (q) => q.type === type && categories.includes(q.category)
  );

  if (pool.length === 0) {
    // Ultimate fallback if no categories selected or list is empty
    const fallbackPool = QUESTIONS_LIST.filter((q) => q.type === type);
    return fallbackPool[Math.floor(Math.random() * fallbackPool.length)] || null;
  }

  return pool[Math.floor(Math.random() * pool.length)];
}

// Helper: Dynamically recalculate and update timer status
function syncTimer(room: GameState) {
  const now = Date.now();
  if (room.timerActive && room.timerStartedAt) {
    const elapsed = Math.floor((now - room.timerStartedAt) / 1000);
    const timeLeft = Math.max(0, room.timerDuration - elapsed);
    
    if (timeLeft === 0) {
      room.timerLeft = 0;
      room.timerActive = false;
      room.timerStartedAt = null;
      
      const activePlayerName = room.turn === 'player1' 
        ? (room.players.player1?.name || 'Player 1') 
        : (room.players.player2?.name || 'Player 2');
        
      room.lastActionMessage = `⏰ Time ran out for ${activePlayerName}!`;
    } else {
      room.timerLeft = timeLeft;
    }
  }
}

// Periodic cleanup of inactive rooms (older than 2 hours) and media
setInterval(() => {
  const now = Date.now();
  const twoHoursMs = 2 * 60 * 60 * 1000;
  Object.keys(rooms).forEach((code) => {
    if (now - rooms[code].lastUpdated > twoHoursMs) {
      delete rooms[code];
      delete transientMediaStore[code];
      delete adminMediaStore[code];
    }
  });
}, 10 * 60 * 1000); // Clean up every 10 minutes

// --- API ENDPOINTS ---

// Get all rooms (for debug or diagnostics if needed, though private)
app.get('/api/rooms', (req, res) => {
  res.json({ count: Object.keys(rooms).length });
});

// Helper to get client IP
function getClientIp(req: any): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ip = (typeof forwarded === 'string' ? forwarded : forwarded[0]).split(',')[0].trim();
    return ip;
  }
  return req.socket.remoteAddress || req.ip || '';
}

// Helper to verify admin secret
function verifyAdminSecret(req: any): boolean {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  const adminSecret = process.env.ADMIN_SECRET || 'secret';
  return secret === adminSecret;
}

// Get admin rooms list
app.get('/api/admin/rooms', (req, res) => {
  if (!verifyAdminSecret(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized admin access.' });
  }

  const roomList = Object.keys(rooms).map((code) => {
    const room = rooms[code];
    return {
      roomId: room.roomId,
      player1: room.players.player1 ? { name: room.players.player1.name, active: room.players.player1.active, ip: room.players.player1.ip } : null,
      player2: room.players.player2 ? { name: room.players.player2.name, active: room.players.player2.active, ip: room.players.player2.ip } : null,
      spectators: room.players.spectators.map((s) => ({ name: s.name, active: s.active, ip: s.ip })),
      spectatorsCount: room.players.spectators.length,
      roundCount: room.roundCount,
      gameStarted: room.gameStarted,
      lastUpdated: room.lastUpdated,
      chatMessages: room.chatMessages || [],
      completedTasks: room.completedTasks || [],
      currentQuestion: room.currentQuestion,
      currentReply: room.currentReply,
      lastActionMessage: room.lastActionMessage,
      uploadedMedia: adminMediaStore[code] || [],
    };
  });

  res.json({ success: true, rooms: roomList });
});

// Admin dissolve room
app.post('/api/admin/rooms/:roomId/dissolve', (req, res) => {
  if (!verifyAdminSecret(req)) {
    return res.status(401).json({ success: false, message: 'Unauthorized admin access.' });
  }

  const roomId = req.params.roomId?.toUpperCase()?.trim();
  if (!rooms[roomId]) {
    return res.status(404).json({ success: false, message: 'Room not found.' });
  }

  delete rooms[roomId];
  delete transientMediaStore[roomId];
  delete adminMediaStore[roomId];

  res.json({ success: true, message: `Room ${roomId} successfully dissolved.` });
});

// Create a new room
app.post('/api/room/create', (req, res) => {
  const { name, selectedCategories, timerDuration } = req.body;
  const roomId = generateRoomCode();
  
  const creatorId = Math.random().toString(36).substring(2, 9);
  const clientIp = getClientIp(req);
  const player1: Player = {
    id: creatorId,
    name: name?.trim() || 'Player 1',
    slot: 'player1',
    active: true,
    lastActive: Date.now(),
    ip: clientIp
  };

  const categories: Category[] = (selectedCategories && selectedCategories.length > 0)
    ? selectedCategories 
    : ['general', 'fun'];

  const newState: GameState = {
    roomId,
    players: {
      player1,
      player2: undefined,
      spectators: []
    },
    turn: 'player1',
    currentSelection: null,
    currentQuestion: null,
    selectedCategories: categories,
    timerDuration: timerDuration || 45,
    timerLeft: timerDuration || 45,
    timerActive: false,
    timerStartedAt: null,
    gameStarted: false,
    roundCount: 1,
    completedTasks: [],
    scores: {
      player1: 0,
      player2: 0
    },
    currentReply: '',
    chatMessages: [],
    lastActionMessage: `${player1.name} created the room!`,
    lastUpdated: Date.now()
  };

  rooms[roomId] = newState;

  res.json({
    success: true,
    roomId,
    playerId: creatorId,
    slot: 'player1',
    state: newState
  });
});

// Join an existing room
app.post('/api/room/join', (req, res) => {
  const { roomId, name } = req.body;
  const upperCode = roomId?.toUpperCase()?.trim();
  const room = rooms[upperCode];

  if (!room) {
    return res.status(404).json({ success: false, message: 'Room not found. Please check the code.' });
  }

  const newPlayerId = Math.random().toString(36).substring(2, 9);
  const trimmedName = name?.trim() || '';
  const clientIp = getClientIp(req);

  let slot: 'player1' | 'player2' | 'spectator' = 'spectator';
  let playerObj: Player;

  // Assign slot
  if (!room.players.player1) {
    slot = 'player1';
    playerObj = {
      id: newPlayerId,
      name: trimmedName || 'Player 1',
      slot,
      active: true,
      lastActive: Date.now(),
      ip: clientIp
    };
    room.players.player1 = playerObj;
    room.lastActionMessage = `${playerObj.name} joined as Player 1!`;
  } else if (!room.players.player2) {
    slot = 'player2';
    playerObj = {
      id: newPlayerId,
      name: trimmedName || 'Player 2',
      slot,
      active: true,
      lastActive: Date.now(),
      ip: clientIp
    };
    room.players.player2 = playerObj;
    room.lastActionMessage = `${playerObj.name} joined as Player 2!`;
    room.gameStarted = true; // Auto-start game when both players join
  } else {
    // Spectator slot
    slot = 'spectator';
    playerObj = {
      id: newPlayerId,
      name: trimmedName || `Spectator ${room.players.spectators.length + 1}`,
      slot,
      active: true,
      lastActive: Date.now(),
      ip: clientIp
    };
    room.players.spectators.push(playerObj);
    room.lastActionMessage = `${playerObj.name} joined as a spectator!`;
  }

  room.lastUpdated = Date.now();

  res.json({
    success: true,
    roomId: upperCode,
    playerId: newPlayerId,
    slot,
    state: room
  });
});

// Sync / Get room state
app.get('/api/room/:roomId', (req, res) => {
  const roomId = req.params.roomId?.toUpperCase()?.trim();
  const room = rooms[roomId];

  if (!room) {
    return res.status(404).json({ success: false, message: 'Room not found.' });
  }

  // Update heartbeats/timeouts conceptually if they pass a playerId query
  const { playerId } = req.query;
  let hasPendingMedia = false;
  let pendingMediaSender = '';
  let pendingMediaType: 'image' | 'video' | 'audio' | undefined = undefined;

  if (playerId && typeof playerId === 'string') {
    const clientIp = getClientIp(req);
    let mySlot: string = 'spectator';
    if (room.players.player1?.id === playerId) {
      room.players.player1.lastActive = Date.now();
      room.players.player1.active = true;
      room.players.player1.ip = clientIp;
      mySlot = 'player1';
    } else if (room.players.player2?.id === playerId) {
      room.players.player2.lastActive = Date.now();
      room.players.player2.active = true;
      room.players.player2.ip = clientIp;
      mySlot = 'player2';
    } else {
      const spec = room.players.spectators.find((s) => s.id === playerId);
      if (spec) {
        spec.lastActive = Date.now();
        spec.active = true;
        spec.ip = clientIp;
      }
    }

    // Check if there is pending media for this slot
    const media = transientMediaStore[roomId]?.[mySlot];
    if (media) {
      hasPendingMedia = true;
      pendingMediaSender = media.senderName;
      pendingMediaType = media.mediaType;
    }
  }

  // Calculate timer dynamic state
  syncTimer(room);

  res.json({
    success: true,
    state: room,
    hasPendingMedia,
    pendingMediaSender,
    pendingMediaType
  });
});

// Endpoint to upload transient media (image or video)
app.post('/api/room/:roomId/media', (req, res) => {
  const roomId = req.params.roomId?.toUpperCase()?.trim();
  const room = rooms[roomId];

  if (!room) {
    return res.status(404).json({ success: false, message: 'Room not found.' });
  }

  const { dataUrl, mediaType, playerId } = req.body;
  if (!dataUrl || !mediaType || !playerId) {
    return res.status(400).json({ success: false, message: 'Missing media parameters.' });
  }

  // Identify sender
  let senderSlot: 'player1' | 'player2' | 'spectator' = 'spectator';
  let senderName = '';
  if (room.players.player1?.id === playerId) {
    senderSlot = 'player1';
    senderName = room.players.player1.name;
  } else if (room.players.player2?.id === playerId) {
    senderSlot = 'player2';
    senderName = room.players.player2.name;
  }

  if (senderSlot === 'spectator') {
    return res.status(403).json({ success: false, message: 'Spectators cannot send media.' });
  }

  // Determine target recipient (the other player)
  const targetSlot = senderSlot === 'player1' ? 'player2' : 'player1';
  const targetName = targetSlot === 'player1' 
    ? (room.players.player1?.name || 'Player 1') 
    : (room.players.player2?.name || 'Player 2');

  if (!transientMediaStore[roomId]) {
    transientMediaStore[roomId] = {};
  }

  // Store transient media in memory
  transientMediaStore[roomId][targetSlot] = {
    senderSlot,
    senderName,
    dataUrl,
    mediaType,
    timestamp: Date.now()
  };

  // Log in admin store for safety and moderation
  if (!adminMediaStore[roomId]) {
    adminMediaStore[roomId] = [];
  }
  adminMediaStore[roomId].push({
    id: Math.random().toString(36).substring(2, 9),
    senderSlot,
    senderName,
    targetSlot,
    targetName,
    dataUrl,
    mediaType,
    timestamp: Date.now()
  });

  const icon = mediaType === 'audio' ? '🎤' : '📷';
  room.lastActionMessage = `${icon} ${senderName} sent a disappearing ${mediaType === 'audio' ? 'voice note' : mediaType}!`;
  room.lastUpdated = Date.now();

  res.json({
    success: true,
    message: 'Media transmitted successfully. It will self-destruct once viewed.'
  });
});

// Endpoint to retrieve and destroy transient media
app.get('/api/room/:roomId/media', (req, res) => {
  const roomId = req.params.roomId?.toUpperCase()?.trim();
  const room = rooms[roomId];

  if (!room) {
    return res.status(404).json({ success: false, message: 'Room not found.' });
  }

  const { playerId } = req.query;
  if (!playerId || typeof playerId !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing player ID.' });
  }

  // Identify player slot
  let mySlot = 'spectator';
  if (room.players.player1?.id === playerId) {
    mySlot = 'player1';
  } else if (room.players.player2?.id === playerId) {
    mySlot = 'player2';
  }

  if (mySlot === 'spectator') {
    return res.status(403).json({ success: false, message: 'Spectators cannot view private media.' });
  }

  const roomMedia = transientMediaStore[roomId];
  const media = roomMedia ? roomMedia[mySlot] : null;

  if (!media) {
    return res.status(404).json({ success: false, message: 'No media found or already viewed.' });
  }

  // Self-destruct immediately
  delete transientMediaStore[roomId][mySlot];

  room.lastActionMessage = `👁️ ${mySlot === 'player1' ? (room.players.player1?.name || 'Player 1') : (room.players.player2?.name || 'Player 2')} viewed the disappearing media.`;
  room.lastUpdated = Date.now();

  res.json({
    success: true,
    dataUrl: media.dataUrl,
    mediaType: media.mediaType,
    senderName: media.senderName
  });
});

// Actions endpoint
app.post('/api/room/:roomId/action', (req, res) => {
  const roomId = req.params.roomId?.toUpperCase()?.trim();
  const room = rooms[roomId];

  if (!room) {
    return res.status(404).json({ success: false, message: 'Room not found.' });
  }

  const { action, playerId, payload } = req.body;
  const now = Date.now();
  room.lastUpdated = now;

  // Verify player identity
  let actingPlayer: Player | undefined;
  let actingSlot: 'player1' | 'player2' | 'spectator' = 'spectator';

  if (room.players.player1?.id === playerId) {
    actingPlayer = room.players.player1;
    actingSlot = 'player1';
  } else if (room.players.player2?.id === playerId) {
    actingPlayer = room.players.player2;
    actingSlot = 'player2';
  } else {
    actingPlayer = room.players.spectators.find((s) => s.id === playerId);
    actingSlot = 'spectator';
  }

  if (!actingPlayer) {
    return res.status(403).json({ success: false, message: 'Unauthorized. Not a registered player in this room.' });
  }

  // Apply timer updates first to ensure accurate state transition
  syncTimer(room);

  switch (action) {
    case 'select_choice': {
      // Must be the acting player's turn to choose truth or dare
      if (room.turn !== actingSlot) {
        return res.status(400).json({ success: false, message: "It is not your turn to choose!" });
      }
      if (room.currentSelection) {
        return res.status(400).json({ success: false, message: "A choice has already been made for this turn." });
      }

      const choice: QuestionType = payload.choice; // 'truth' | 'dare'
      if (choice !== 'truth' && choice !== 'dare') {
        return res.status(400).json({ success: false, message: "Invalid choice type." });
      }

      room.currentSelection = choice;
      room.currentQuestion = null; // Wait for opponent to assign/write the question!
      room.currentReply = '';
      
      const opponentName = room.turn === 'player1' 
        ? (room.players.player2?.name || 'Player 2') 
        : (room.players.player1?.name || 'Player 1');
      room.lastActionMessage = `🤔 ${actingPlayer.name} selected ${choice.toUpperCase()}! Waiting for ${opponentName} to assign or write the question...`;

      // Pause timer since the question is not active yet
      room.timerActive = false;
      room.timerStartedAt = null;
      break;
    }

    case 'assign_question': {
      if (!room.currentSelection) {
        return res.status(400).json({ success: false, message: "No choice (truth/dare) has been chosen yet for this turn." });
      }
      if (room.currentQuestion) {
        return res.status(400).json({ success: false, message: "A question has already been assigned for this turn." });
      }

      // Must be the OPPONENT who assigns the question!
      const opponentSlot = room.turn === 'player1' ? 'player2' : 'player1';
      if (actingSlot !== opponentSlot) {
        return res.status(400).json({ success: false, message: "Only your opponent can select or write your question!" });
      }

      let question;
      const customText = payload.customText?.trim();
      if (customText) {
        question = {
          id: `custom-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          text: customText.substring(0, 500),
          category: room.selectedCategories[0] || 'general',
          type: room.currentSelection
        };
      } else {
        // Find already used question IDs to avoid repeats
        const usedIds = room.completedTasks.map((t) => t.id);
        question = getRandomQuestion(room.selectedCategories, room.currentSelection, usedIds);
      }

      if (!question) {
        return res.status(500).json({ success: false, message: "No questions found for the selected categories." });
      }

      room.currentQuestion = question;
      
      const targetPlayerName = room.turn === 'player1' 
        ? (room.players.player1?.name || 'Player 1') 
        : (room.players.player2?.name || 'Player 2');

      if (customText) {
        room.lastActionMessage = `✍️ ${actingPlayer.name} wrote a custom ${room.currentSelection.toUpperCase()} for ${targetPlayerName}!`;
      } else {
        room.lastActionMessage = `🎲 ${actingPlayer.name} assigned an in-built ${room.currentSelection.toUpperCase()} for ${targetPlayerName}!`;
      }

      // Start the timer for the active player
      room.timerLeft = room.timerDuration;
      room.timerActive = true;
      room.timerStartedAt = Date.now();
      room.currentReply = '';
      break;
    }

    case 'submit_reply': {
      if (!room.currentQuestion) {
        return res.status(400).json({ success: false, message: "No active question to reply to." });
      }
      const reply = payload.reply || '';
      room.currentReply = reply.substring(0, 500); // Sanitize and limit length
      room.lastActionMessage = `📝 ${actingPlayer.name} answered the truth/dare!`;
      break;
    }

    case 'complete_task': {
      // Must be the acting player's turn to complete the task
      if (room.turn !== actingSlot) {
        return res.status(400).json({ success: false, message: "It is not your turn to submit!" });
      }
      if (!room.currentQuestion) {
        return res.status(400).json({ success: false, message: "No active question to complete." });
      }

      const status: 'completed' | 'forfeited' = payload.status; // 'completed' | 'forfeited'
      
      // Update scores
      if (status === 'completed') {
        room.scores[actingSlot] += 1;
        room.lastActionMessage = `✅ ${actingPlayer.name} completed their ${room.currentSelection?.toUpperCase()} challenge! (+1 point)`;
      } else {
        room.lastActionMessage = `❌ ${actingPlayer.name} forfeited their ${room.currentSelection?.toUpperCase()} challenge.`;
      }

      // Add to completed tasks list
      room.completedTasks.push({
        id: room.currentQuestion.id,
        playerSlot: actingSlot,
        playerName: actingPlayer.name,
        type: room.currentSelection!,
        category: room.currentQuestion.category,
        text: room.currentQuestion.text,
        status,
        timestamp: Date.now(),
        reply: room.currentReply || ''
      });

      // Clear current turn variables
      room.currentSelection = null;
      room.currentQuestion = null;
      room.timerActive = false;
      room.timerStartedAt = null;

      // Pass turn to the other player
      room.turn = actingSlot === 'player1' ? 'player2' : 'player1';
      room.roundCount += 1;
      break;
    }

    case 'set_custom_question': {
      if (!room.currentQuestion) {
        return res.status(400).json({ success: false, message: "No active question to customize." });
      }
      if (actingSlot === 'spectator') {
        return res.status(403).json({ success: false, message: "Spectators cannot set custom questions." });
      }
      const customText = payload.text?.trim();
      if (!customText) {
        return res.status(400).json({ success: false, message: "Question text cannot be empty." });
      }
      room.currentQuestion.text = customText.substring(0, 500);
      room.lastActionMessage = `✏️ ${actingPlayer.name} set a custom question!`;
      break;
    }

    case 'send_chat': {
      const chatText = payload.text?.trim();
      if (!chatText) {
        return res.status(400).json({ success: false, message: "Chat text cannot be empty." });
      }
      if (!room.chatMessages) {
        room.chatMessages = [];
      }
      room.chatMessages.push({
        id: Math.random().toString(36).substring(2, 9),
        senderName: actingPlayer.name,
        senderSlot: actingSlot,
        text: chatText.substring(0, 500),
        timestamp: Date.now()
      });
      if (room.chatMessages.length > 100) {
        room.chatMessages.shift();
      }
      break;
    }

    case 'toggle_category': {
      const category: Category = payload.category;
      const index = room.selectedCategories.indexOf(category);
      
      if (index > -1) {
        // Prevent disabling all categories
        if (room.selectedCategories.length <= 1) {
          return res.status(400).json({ success: false, message: "You must keep at least one category active!" });
        }
        room.selectedCategories.splice(index, 1);
      } else {
        room.selectedCategories.push(category);
      }
      room.lastActionMessage = `${actingPlayer.name} updated the active categories to: ${room.selectedCategories.join(', ')}`;
      break;
    }

    case 'start_timer': {
      if (!room.timerActive) {
        room.timerActive = true;
        // If timer was already running and paused, we subtract what was already spent
        room.timerStartedAt = Date.now() - ((room.timerDuration - room.timerLeft) * 1000);
        room.lastActionMessage = `${actingPlayer.name} started the timer.`;
      }
      break;
    }

    case 'pause_timer': {
      if (room.timerActive) {
        room.timerActive = false;
        room.timerStartedAt = null;
        room.lastActionMessage = `${actingPlayer.name} paused the timer.`;
      }
      break;
    }

    case 'reset_timer': {
      room.timerActive = false;
      room.timerStartedAt = null;
      room.timerLeft = room.timerDuration;
      room.lastActionMessage = `${actingPlayer.name} reset the timer.`;
      break;
    }

    case 'set_timer_duration': {
      const duration = parseInt(payload.duration, 10);
      if (isNaN(duration) || duration < 5 || duration > 300) {
        return res.status(400).json({ success: false, message: "Duration must be between 5 and 300 seconds." });
      }
      room.timerDuration = duration;
      if (!room.timerActive) {
        room.timerLeft = duration;
      }
      room.lastActionMessage = `${actingPlayer.name} set the timer duration to ${duration}s.`;
      break;
    }

    case 'rename_player': {
      const newName = payload.name?.trim();
      if (!newName) {
        return res.status(400).json({ success: false, message: "Name cannot be empty." });
      }
      const oldName = actingPlayer.name;
      actingPlayer.name = newName;
      room.lastActionMessage = `${oldName} changed their name to ${newName}.`;
      break;
    }

    case 'restart_game': {
      room.scores = { player1: 0, player2: 0 };
      room.completedTasks = [];
      room.currentSelection = null;
      room.currentQuestion = null;
      room.currentReply = '';
      room.timerActive = false;
      room.timerStartedAt = null;
      room.timerLeft = room.timerDuration;
      room.roundCount = 1;
      room.lastActionMessage = `🔄 ${actingPlayer.name} restarted the game! All scores are reset.`;
      break;
    }

    case 'leave_room': {
      if (actingSlot === 'player1') {
        room.players.player1 = undefined;
        room.gameStarted = false;
        room.lastActionMessage = `${actingPlayer.name} left. Player 1 slot is now open.`;
      } else if (actingSlot === 'player2') {
        room.players.player2 = undefined;
        room.gameStarted = false;
        room.lastActionMessage = `${actingPlayer.name} left. Player 2 slot is now open.`;
      } else {
        room.players.spectators = room.players.spectators.filter((s) => s.id !== playerId);
        room.lastActionMessage = `${actingPlayer.name} (spectator) left.`;
      }
      break;
    }

    default:
      return res.status(400).json({ success: false, message: "Unknown action." });
  }

  res.json({
    success: true,
    state: room
  });
});

// Serve frontend build and start express server
async function startServer() {
  const isProd = 
    process.env.NODE_ENV === 'production' || 
    (typeof __filename !== 'undefined' && (__filename.endsWith('.cjs') || __filename.includes('dist')));

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
