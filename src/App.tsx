import { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RefreshCw, 
  Copy, 
  Check, 
  Users, 
  Flame, 
  Sparkles, 
  Laugh, 
  Timer, 
  CheckCircle, 
  XCircle, 
  HelpCircle, 
  Volume2, 
  VolumeX, 
  ChevronRight, 
  Plus, 
  UserPlus, 
  Info,
  LogOut,
  Image as ImageIcon,
  Video,
  Camera,
  Eye,
  Trash2,
  Lock,
  ShieldCheck,
  Send,
  FileVideo,
  MessageSquare,
  History,
  Activity,
  User,
  Settings,
  Mic,
  HelpCircle as QuestionIcon
} from 'lucide-react';
import { GameState, Category, QuestionType, Player } from './types';

// Browser-safe sound synthesizer using Web Audio API
function playSound(type: 'success' | 'forfeit' | 'tick' | 'alarm', enabled: boolean) {
  if (!enabled) return;
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } else if (type === 'forfeit') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(293.66, ctx.currentTime); // D4
      osc.frequency.setValueAtTime(220.00, ctx.currentTime + 0.15); // A3
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'tick') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(700, ctx.currentTime);
      gain.gain.setValueAtTime(0.03, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } else if (type === 'alarm') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start();
      osc.stop(ctx.currentTime + 0.55);
    }
  } catch (e) {
    // AudioContext blocked or unsupported
  }
}

export default function App() {
  // Screen and session states
  const [roomId, setRoomId] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>('');
  const [playerId, setPlayerId] = useState<string>('');
  const [playerSlot, setPlayerSlot] = useState<'player1' | 'player2' | 'spectator' | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);

  // Transient View-Once Media States
  const [hasPendingMedia, setHasPendingMedia] = useState<boolean>(false);
  const [pendingMediaSender, setPendingMediaSender] = useState<string>('');
  const [pendingMediaType, setPendingMediaType] = useState<'image' | 'video' | 'audio' | null>(null);
  const [viewingMedia, setViewingMedia] = useState<{ dataUrl: string; mediaType: 'image' | 'video' | 'audio'; senderName: string } | null>(null);
  const [adminViewingMedia, setAdminViewingMedia] = useState<{ id: string; senderName: string; targetName: string; mediaType: 'image' | 'video' | 'audio'; dataUrl: string; timestamp: number } | null>(null);
  const [mediaSendingStatus, setMediaSendingStatus] = useState<'idle' | 'reading' | 'sending' | 'success' | 'error'>('idle');
  const [mediaSendingMessage, setMediaSendingMessage] = useState<string>('');
  
  // Custom config states (for Room Creation)
  const [createName, setCreateName] = useState<string>('');
  const [createCategories, setCreateCategories] = useState<Category[]>(['general', 'fun']);
  const [createTimer, setCreateTimer] = useState<number>(45);

  // Join Room states
  const [joinCode, setJoinCode] = useState<string>('');
  const [joinName, setJoinName] = useState<string>('');

  // UI settings & feedback
  const [copied, setCopied] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [localTimerLeft, setLocalTimerLeft] = useState<number>(45);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState<boolean>(false);

  // Synchronized text reply state
  const [myReply, setMyReply] = useState<string>('');

  // Custom question editing state
  const [isCustomizingQuestion, setIsCustomizingQuestion] = useState<boolean>(false);
  const [customQuestionText, setCustomQuestionText] = useState<string>('');

  // Opponent choice assignment draft state (custom writing text)
  const [showCustomWriter, setShowCustomWriter] = useState<boolean>(false);
  const [opponentCustomDraft, setOpponentCustomDraft] = useState<string>('');

  // Admin Portal States
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [adminSecret, setAdminSecret] = useState<string>('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(false);
  const [adminRooms, setAdminRooms] = useState<any[]>([]);
  const [adminError, setAdminError] = useState<string>('');
  const [selectedAdminRoomId, setSelectedAdminRoomId] = useState<string | null>(null);

  // Auto-scroll ref and effect for Room Chat
  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState?.chatMessages?.length]);

  // To prevent multiple trigger of the alarm sound
  const alarmTriggered = useRef<boolean>(false);
  const previousTurn = useRef<'player1' | 'player2' | null>(null);
  const previousSelection = useRef<string | null>(null);

  // Read invite/room code from URL on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeFromUrl = params.get('room') || params.get('code');
    if (codeFromUrl) {
      setJoinCode(codeFromUrl.toUpperCase());
    }
    
    // Load local player session if exists
    const cachedPlayerId = sessionStorage.getItem('tod_playerId');
    const cachedRoomId = sessionStorage.getItem('tod_roomId');
    const cachedSlot = sessionStorage.getItem('tod_slot') as any;
    const cachedName = sessionStorage.getItem('tod_playerName');

    if (cachedPlayerId && cachedRoomId && cachedSlot && cachedName) {
      setPlayerId(cachedPlayerId);
      setRoomId(cachedRoomId);
      setPlayerSlot(cachedSlot);
      setPlayerName(cachedName);
      fetchState(cachedRoomId, cachedPlayerId);
    }
  }, []);

  // Sync state polling
  useEffect(() => {
    if (!roomId || !playerId) return;

    fetchState(roomId, playerId);
    const interval = setInterval(() => {
      fetchState(roomId, playerId);
    }, 1500);

    return () => clearInterval(interval);
  }, [roomId, playerId]);

  // Synchronized countdown ticks and sounds
  useEffect(() => {
    if (!gameState) return;

    // Reset local timer on selection change or timer reset
    setLocalTimerLeft(gameState.timerLeft);

    if (gameState.timerLeft <= 0) {
      if (gameState.timerActive && !alarmTriggered.current) {
        playSound('alarm', soundEnabled);
        alarmTriggered.current = true;
      }
      return;
    }

    alarmTriggered.current = false;

    if (!gameState.timerActive) return;

    const interval = setInterval(() => {
      setLocalTimerLeft((prev) => {
        const nextValue = Math.max(0, prev - 1);
        if (nextValue <= 5 && nextValue > 0) {
          playSound('tick', soundEnabled);
        }
        return nextValue;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState?.timerActive, gameState?.timerLeft, gameState?.timerStartedAt]);

  // Handle game state changes for sound cues
  useEffect(() => {
    if (!gameState) return;

    previousTurn.current = gameState.turn;

    // Action submitted sounds
    if (gameState.completedTasks.length > 0) {
      const lastTask = gameState.completedTasks[gameState.completedTasks.length - 1];
      const taskKey = `${lastTask.id}-${lastTask.status}`;
      if (previousSelection.current && previousSelection.current !== taskKey) {
        if (lastTask.status === 'completed') {
          playSound('success', soundEnabled);
        } else {
          playSound('forfeit', soundEnabled);
        }
      }
      previousSelection.current = taskKey;
    }
  }, [gameState?.completedTasks, gameState?.turn]);

  // Reset myReply and custom question inputs whenever the current question changes or is cleared
  useEffect(() => {
    if (!gameState?.currentQuestion) {
      setMyReply('');
      setIsCustomizingQuestion(false);
      setCustomQuestionText('');
    } else {
      setCustomQuestionText(gameState.currentQuestion.text);
    }
    setShowCustomWriter(false);
    setOpponentCustomDraft('');
  }, [gameState?.currentQuestion?.id, gameState?.currentQuestion?.text, gameState?.currentSelection]);

  // Fetch current room state
  const fetchState = async (id: string, pId: string) => {
    try {
      const response = await fetch(`/api/room/${id}?playerId=${pId}`);
      if (!response.ok) {
        if (response.status === 404) {
          // Room expired or doesn't exist
          clearSession();
        }
        return;
      }
      const data = await response.json();
      if (data.success) {
        setGameState(data.state);
        setHasPendingMedia(data.hasPendingMedia || false);
        setPendingMediaSender(data.pendingMediaSender || '');
        setPendingMediaType(data.pendingMediaType || null);
        // Align active name
        if (playerSlot === 'player1' && data.state.players.player1) {
          setPlayerName(data.state.players.player1.name);
        } else if (playerSlot === 'player2' && data.state.players.player2) {
          setPlayerName(data.state.players.player2.name);
        }
      }
    } catch (err) {
      console.error("State sync error:", err);
    }
  };

  const clearSession = () => {
    sessionStorage.clear();
    setRoomId('');
    setPlayerId('');
    setPlayerSlot(null);
    setGameState(null);
  };

  const fetchAdminRooms = async (secretToUse?: string) => {
    const key = secretToUse !== undefined ? secretToUse : adminSecret;
    try {
      setAdminError('');
      const response = await fetch(`/api/admin/rooms?secret=${encodeURIComponent(key)}`);
      const data = await response.json();
      if (data.success) {
        setAdminRooms(data.rooms);
        setIsAdminAuthenticated(true);
      } else {
        setAdminError(data.message || 'Authentication failed.');
        setIsAdminAuthenticated(false);
      }
    } catch (err) {
      setAdminError('Failed to fetch rooms from server.');
      setIsAdminAuthenticated(false);
    }
  };

  const handleDissolveRoom = async (targetRoomId: string) => {
    if (!window.confirm(`Are you absolutely sure you want to dissolve room ${targetRoomId}? This will terminate the game immediately.`)) {
      return;
    }
    try {
      const response = await fetch(`/api/admin/rooms/${targetRoomId}/dissolve?secret=${encodeURIComponent(adminSecret)}`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        fetchAdminRooms();
        if (selectedAdminRoomId === targetRoomId) {
          setSelectedAdminRoomId(null);
        }
      } else {
        alert(data.message || 'Failed to dissolve room.');
      }
    } catch (err) {
      alert('Error dissolving room.');
    }
  };

  const renderAdminModal = () => {
    if (!isAdminOpen) return null;
    const selectedRoom = adminRooms.find((r) => r.roomId === selectedAdminRoomId);

    return (
      <div className="fixed inset-0 bg-zinc-950/80 z-50 flex items-center justify-center p-4 backdrop-blur-md" id="admin-portal-modal">
        <div 
          className={`w-full bg-[#FCFAF0] border-4 border-zinc-950 p-6 md:p-8 shadow-[8px_8px_0px_0px_#000] rounded-3xl relative overflow-hidden transition-all duration-300 max-h-[90vh] overflow-y-auto ${
            isAdminAuthenticated ? 'max-w-5xl' : 'max-w-xl'
          }`} 
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex justify-between items-start mb-6 pb-4 border-b-4 border-zinc-950">
            <div>
              <h3 className="font-display font-black text-2xl tracking-tight text-zinc-950 flex items-center gap-2">
                <ShieldCheck className="w-7 h-7 text-[#FF5580]" /> ADMIN CONTROL ROOM
              </h3>
              <p className="text-xs text-zinc-600 mt-1 font-mono font-medium">REAL-TIME GAME ROOM SECURITY MODERATION</p>
            </div>
            <button 
              onClick={() => {
                setIsAdminOpen(false);
                setAdminSecret('');
                setIsAdminAuthenticated(false);
                setAdminRooms([]);
                setAdminError('');
                setSelectedAdminRoomId(null);
              }}
              className="px-4 py-2 bg-[#FF5580] hover:bg-[#ff3c6c] border-[3px] border-zinc-950 rounded-xl text-white font-display font-black uppercase text-xs shadow-[3px_3px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all cursor-pointer"
            >
              Close Console
            </button>
          </div>

          {/* Content: Auth or Rooms list */}
          {!isAdminAuthenticated ? (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-[#FFDE4D] border-[3px] border-zinc-950 rounded-2xl shadow-[4px_4px_0px_0px_#000] font-mono text-xs text-zinc-900 leading-normal">
                ⚠️ <strong>ATTENTION MODERATOR:</strong> Decryption passcode is required to audit text streams, examine participant IP addresses, or dissolve active game sockets.
              </div>
              
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-zinc-950 mb-2">MODERATOR SECRET KEY</label>
                <input 
                  type="password" 
                  value={adminSecret}
                  onChange={(e) => setAdminSecret(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      fetchAdminRooms();
                    }
                  }}
                  placeholder="Enter system master passcode..." 
                  className="w-full bg-white border-[3px] border-zinc-950 rounded-2xl px-4 py-3 text-zinc-950 outline-none font-mono text-sm shadow-[3px_3px_0px_0px_#000] focus:shadow-[5px_5px_0px_0px_#000] transition-all"
                />
              </div>

              {adminError && (
                <div className="p-3 bg-[#FF5580]/10 border-2 border-[#FF5580] text-[#FF5580] rounded-xl text-xs font-bold font-mono">
                  ERROR: {adminError}
                </div>
              )}

              <button
                onClick={() => fetchAdminRooms()}
                className="w-full py-3.5 bg-[#06D6A0] hover:bg-[#04c290] text-zinc-950 font-display font-black text-sm uppercase tracking-wide rounded-2xl shadow-[4px_4px_0px_0px_#000] border-[3px] border-zinc-950 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all cursor-pointer"
              >
                DECRYPT DATABASE STREAMS
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-h-[450px]">
              {/* Left Column: Room List */}
              <div className="md:col-span-5 flex flex-col space-y-4 h-full overflow-hidden">
                <div className="flex justify-between items-center">
                  <h4 className="font-display font-black text-sm uppercase text-zinc-950 flex items-center gap-1.5">
                    <Activity className="w-4.5 h-4.5 text-[#06D6A0]" /> ACTIVE ROOMS ({adminRooms.length})
                  </h4>
                  <button 
                    onClick={() => fetchAdminRooms()} 
                    className="p-1.5 bg-[#4CC9F0] border-2 border-zinc-950 rounded-lg shadow-[2px_2px_0px_0px_#000] text-zinc-950 hover:bg-[#3bbbe3] transition"
                    title="Reload data"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-2 max-h-[380px] scrollbar-thin">
                  {adminRooms.length === 0 ? (
                    <div className="p-8 bg-white border-[3px] border-zinc-950 rounded-2xl text-center text-zinc-500 font-mono text-xs">
                      No active rooms found in cache database.
                    </div>
                  ) : (
                    adminRooms.map((r) => (
                      <div 
                        key={r.roomId}
                        onClick={() => setSelectedAdminRoomId(r.roomId)}
                        className={`p-3.5 border-[3px] rounded-2xl cursor-pointer text-left transition-all ${
                          selectedAdminRoomId === r.roomId 
                            ? 'bg-[#FFDE4D] border-zinc-950 shadow-[4px_4px_0px_0px_#000]' 
                            : 'bg-white border-zinc-200 hover:border-zinc-950 hover:shadow-[3px_3px_0px_0px_#000]'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-mono font-black text-base text-zinc-950 bg-white border-2 border-zinc-950 px-2 py-0.5 rounded-lg shadow-[1px_1px_0px_0px_#000]">
                            ROOM: {r.roomId}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDissolveRoom(r.roomId);
                            }}
                            className="px-2 py-1 bg-[#FF5580] text-white border-2 border-zinc-950 rounded-lg text-[9px] font-black uppercase shadow-[1px_1px_0px_0px_#000] hover:translate-x-[0.5px] hover:translate-y-[0.5px] hover:shadow-none active:translate-y-px transition"
                          >
                            DISSOLVE
                          </button>
                        </div>

                        <div className="space-y-1 text-xs text-zinc-700 font-medium">
                          <div>
                            <strong>P1 Host:</strong> {r.player1 ? `${r.player1.name} (IP: ${r.player1.ip || 'N/A'})` : <span className="text-zinc-400">Empty</span>}
                          </div>
                          <div>
                            <strong>P2 Opponent:</strong> {r.player2 ? `${r.player2.name} (IP: ${r.player2.ip || 'N/A'})` : <span className="text-zinc-400">Waiting...</span>}
                          </div>
                          {r.spectatorsCount > 0 && (
                            <div className="text-[11px] text-indigo-700">
                              👀 {r.spectatorsCount} active spectators monitor.
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Right Column: Audit Logs details */}
              <div className="md:col-span-7 flex flex-col h-full overflow-hidden bg-white border-[3px] border-zinc-950 rounded-2xl p-4 shadow-[4px_4px_0px_0px_#000]">
                {selectedRoom ? (
                  <div className="flex flex-col h-full space-y-4 overflow-hidden">
                    {/* Header */}
                    <div className="flex justify-between items-center border-b-2 border-zinc-950 pb-3 shrink-0">
                      <div className="text-left">
                        <h4 className="font-display font-black text-sm text-zinc-950 tracking-wide flex items-center gap-2">
                          <Eye className="w-4.5 h-4.5 text-[#FF5580]" /> AUDITING: <span className="text-indigo-600 font-mono font-black">{selectedRoom.roomId}</span>
                        </h4>
                        <p className="text-[10px] text-zinc-500 mt-0.5">LIVE SECURED DIALOGUES MONITORING</p>
                      </div>
                      <span className="text-[9px] bg-zinc-950 text-[#06D6A0] font-mono font-bold px-2 py-1 rounded-lg border-2 border-zinc-950">
                        {selectedRoom.chatMessages?.length || 0} MESSAGES
                      </span>
                    </div>

                    {/* Chat Logs / Activity Tab Selector */}
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-left max-h-[330px] scrollbar-thin">
                      
                      {/* IP Addresses connected */}
                      <div className="bg-[#4CC9F0]/10 border-2 border-[#4CC9F0] p-3 rounded-xl space-y-1 text-xs">
                        <div className="font-black uppercase text-zinc-950 text-[10px] tracking-wider flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5" /> CONNECTED CLIENT IPS (ATTACK PREVENTION)
                        </div>
                        <ul className="space-y-1 font-mono text-[11px] text-zinc-800">
                          <li>• P1 ({selectedRoom.player1?.name || 'Empty'}): <span className="font-bold text-zinc-950">{selectedRoom.player1?.ip || 'offline'}</span></li>
                          <li>• P2 ({selectedRoom.player2?.name || 'Empty'}): <span className="font-bold text-zinc-950">{selectedRoom.player2?.ip || 'offline'}</span></li>
                          {selectedRoom.spectators.length > 0 && selectedRoom.spectators.map((spec: any, index: number) => (
                            <li key={index}>• Spec ({spec.name}): <span className="font-bold text-zinc-950">{spec.ip || 'offline'}</span></li>
                          ))}
                        </ul>
                      </div>

                      {/* Live Game Status Block */}
                      <div className="bg-[#FFDE4D]/10 border-2 border-[#FFDE4D] p-3 rounded-xl space-y-1 text-xs">
                        <div className="font-black uppercase text-zinc-950 text-[10px]">Current Turn Playback</div>
                        {selectedRoom.lastActionMessage && (
                          <div className="text-zinc-800 italic font-medium">
                            "{selectedRoom.lastActionMessage}"
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-800 bg-white p-2 rounded-lg border-2 border-zinc-200 font-mono mt-1">
                          <div>
                            <span className="text-zinc-500 block">Active Challenge:</span>
                            <span className="text-zinc-900 font-bold">
                              {selectedRoom.currentQuestion ? selectedRoom.currentQuestion.text : 'None selected'}
                            </span>
                          </div>
                          <div>
                            <span className="text-zinc-500 block">Player Draft Reply:</span>
                            <span className="text-zinc-900 font-bold italic">
                              {selectedRoom.currentReply ? `"${selectedRoom.currentReply}"` : 'None yet'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Chat Messages Section */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase text-zinc-950 tracking-wider flex items-center gap-1.5">
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-500" /> Chat Messages Audit Logs
                        </div>
                        <div className="bg-zinc-50 border-2 border-zinc-200 rounded-xl p-3 space-y-2 max-h-[160px] overflow-y-auto font-mono text-[11px]">
                          {!selectedRoom.chatMessages || selectedRoom.chatMessages.length === 0 ? (
                            <p className="text-zinc-500 italic py-4 text-center">No chat messages sent in this room yet.</p>
                          ) : (
                            selectedRoom.chatMessages.map((msg: any, idx: number) => (
                              <div key={idx} className="border-b border-zinc-200/50 pb-1.5 last:border-b-0">
                                <div className="flex items-center justify-between mb-0.5">
                                  <span className={`font-black uppercase text-[9px] px-1 rounded ${
                                    msg.senderSlot === 'player1' ? 'bg-[#06D6A0] text-zinc-950' :
                                    msg.senderSlot === 'player2' ? 'bg-[#FF5580] text-white' :
                                    'bg-zinc-300 text-zinc-800'
                                  }`}>
                                    {msg.senderName} ({msg.senderSlot})
                                  </span>
                                  <span className="text-[8px] text-zinc-500">
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                  </span>
                                </div>
                                <p className="text-zinc-900 font-medium break-words">{msg.text}</p>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Completed Tasks History */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase text-zinc-950 tracking-wider flex items-center gap-1.5">
                          <History className="w-3.5 h-3.5 text-[#06D6A0]" /> Completed Action History (Questions & Answers)
                        </div>
                        <div className="bg-zinc-50 border-2 border-zinc-200 rounded-xl p-3 space-y-2 max-h-[160px] overflow-y-auto font-mono text-[11px]">
                          {!selectedRoom.completedTasks || selectedRoom.completedTasks.length === 0 ? (
                            <p className="text-zinc-500 italic py-4 text-center">No tasks completed or forfeited yet.</p>
                          ) : (
                            selectedRoom.completedTasks.map((task: any, idx: number) => (
                              <div key={idx} className="bg-white p-3 rounded-lg border-2 border-zinc-200 text-[10px] space-y-1">
                                <div className="flex justify-between border-b border-zinc-100 pb-1 mb-1">
                                  <span className="font-bold text-zinc-800">{task.playerName} ({task.playerSlot})</span>
                                  <span className={`px-1 rounded text-[8px] font-black uppercase ${
                                    task.status === 'completed' ? 'bg-[#06D6A0]/20 text-[#04946e]' : 'bg-[#FF5580]/20 text-[#dd2855]'
                                  }`}>
                                    {task.type.toUpperCase()} • {task.status.toUpperCase()}
                                  </span>
                                </div>
                                <div className="text-zinc-800 font-medium">
                                  <span className="text-zinc-500 font-black">Q:</span> {task.text}
                                </div>
                                {task.reply !== undefined && (
                                  <div className="bg-zinc-50 p-1.5 rounded border border-zinc-100 text-zinc-900 mt-1 font-sans">
                                    <span className="text-[#FF5580] font-black font-mono text-[9px] block mb-0.5">ANSWER SUBMITTED:</span>
                                    <p className="italic font-medium text-xs break-words">{task.reply || <span className="text-zinc-400 italic font-mono text-[10px]">(No text answer written)</span>}</p>
                                  </div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Uploaded Media Safety Audit */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-black uppercase text-zinc-950 tracking-wider flex items-center gap-1.5">
                          <Eye className="w-3.5 h-3.5 text-[#FF5580]" /> Uploaded View-Once Media History (Safety & Abuse Prevention)
                        </div>
                        <div className="bg-zinc-50 border-2 border-zinc-200 rounded-xl p-3 space-y-2 max-h-[220px] overflow-y-auto font-mono text-[11px]">
                          {!selectedRoom.uploadedMedia || selectedRoom.uploadedMedia.length === 0 ? (
                            <p className="text-zinc-500 italic py-4 text-center">No disappearing media uploaded in this room yet.</p>
                          ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {selectedRoom.uploadedMedia.map((media: any) => (
                                <div 
                                  key={media.id} 
                                  onClick={() => setAdminViewingMedia(media)}
                                  className="bg-white border-2 border-zinc-950 rounded-lg p-2 flex flex-col justify-between shadow-[2px_2px_0px_0px_#000] cursor-pointer hover:bg-zinc-50 transition-colors group"
                                  title="Click to view full media safety audit"
                                >
                                  <div className="relative aspect-square w-full bg-zinc-100 rounded border border-zinc-200 overflow-hidden mb-1.5 flex items-center justify-center group-hover:border-zinc-950 transition-all">
                                    {media.mediaType === 'image' ? (
                                      <img 
                                        src={media.dataUrl} 
                                        alt="Disappearing Media Audit" 
                                        className="w-full h-full object-cover" 
                                        referrerPolicy="no-referrer"
                                      />
                                    ) : media.mediaType === 'audio' ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center bg-[#FFDE4D]/10">
                                        <span className="text-3xl animate-pulse">🎤</span>
                                        <span className="text-[8px] font-black text-zinc-600 uppercase mt-1">VOICE NOTE</span>
                                      </div>
                                    ) : (
                                      <video 
                                        src={media.dataUrl} 
                                        className="w-full h-full object-cover"
                                      />
                                    )}
                                    <span className="absolute top-1 right-1 bg-zinc-950 text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase">
                                      {media.mediaType}
                                    </span>
                                  </div>
                                  <div className="text-[9px] text-zinc-800 font-bold space-y-0.5 leading-tight font-sans">
                                    <div>From: <span className="text-[#FF5580]">{media.senderName}</span></div>
                                    <div>To: <span className="text-[#06D6A0]">{media.targetName}</span></div>
                                    <div className="text-[7px] text-zinc-400 font-mono mt-1">{new Date(media.timestamp).toLocaleTimeString()}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-zinc-400">
                    <ShieldCheck className="w-14 h-14 text-zinc-300 mb-3" />
                    <h5 className="text-xs font-black uppercase tracking-wider text-zinc-800 mb-1">Select a Room to Audit</h5>
                    <p className="text-[11px] text-zinc-600 max-w-xs leading-normal">
                      Click any active room on the left side to monitor live transcripts, inspect system dialogue, verify IP addresses, or terminate the socket immediately.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Admin Media Viewer Overlay (Inside Admin Portal) */}
          {adminViewingMedia && (
            <div className="fixed inset-0 bg-zinc-950/90 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setAdminViewingMedia(null)}>
              <div 
                className="w-full max-w-2xl bg-[#FCFAF0] border-4 border-zinc-950 p-6 shadow-[8px_8px_0px_0px_#000] rounded-3xl relative overflow-hidden text-left"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Close Button */}
                <button 
                  onClick={() => setAdminViewingMedia(null)}
                  className="absolute top-4 right-4 px-3 py-1.5 bg-[#FF5580] text-white border-2 border-zinc-950 rounded-xl text-xs font-black uppercase shadow-[2px_2px_0px_0px_#000] hover:translate-y-px hover:shadow-none active:translate-y-px active:shadow-none transition cursor-pointer"
                >
                  Close Preview
                </button>

                <div className="mb-4 text-left">
                  <span className="px-2 py-0.5 bg-zinc-950 text-[#FF5580] font-mono text-[9px] font-black uppercase rounded border border-zinc-950 mr-2">
                    SAFETY AUDIT PREVIEW
                  </span>
                  <h4 className="font-display font-black text-lg text-zinc-950 uppercase mt-1.5">
                    Disappearing {adminViewingMedia.mediaType} file
                  </h4>
                  <div className="text-[11px] text-zinc-600 font-bold font-sans mt-0.5">
                    Uploaded by <span className="text-[#FF5580]">{adminViewingMedia.senderName}</span> to <span className="text-[#06D6A0]">{adminViewingMedia.targetName}</span> at {new Date(adminViewingMedia.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                <div className="bg-zinc-100 rounded-2xl border-2 border-zinc-950 p-3 flex items-center justify-center min-h-[250px] max-h-[450px] overflow-hidden mb-4">
                  {adminViewingMedia.mediaType === 'image' ? (
                    <img 
                      src={adminViewingMedia.dataUrl} 
                      alt="Admin Safety Audit Full Image" 
                      className="max-h-[380px] max-w-full rounded-lg object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : adminViewingMedia.mediaType === 'audio' ? (
                    <div className="flex flex-col items-center text-center p-6 bg-white border-2 border-zinc-200 rounded-xl shadow-[3px_3px_0px_0px_#000] w-full max-w-md">
                      <span className="text-4xl mb-3 animate-pulse">🎤</span>
                      <p className="text-xs font-black uppercase tracking-wider text-[#FF5580] mb-1">SAFETY MONITOR AUDIO SOURCE</p>
                      <p className="text-[10px] text-zinc-500 mb-4">Listen to the voice proof uploaded by {adminViewingMedia.senderName}</p>
                      <audio 
                        src={adminViewingMedia.dataUrl} 
                        controls 
                        autoPlay 
                        className="w-full"
                      />
                    </div>
                  ) : (
                    <video 
                      src={adminViewingMedia.dataUrl} 
                      controls 
                      autoPlay 
                      className="max-h-[380px] max-w-full rounded-lg object-contain"
                    />
                  )}
                </div>

                <div className="flex justify-between items-center text-[10px] text-zinc-500 font-mono font-bold">
                  <span>ID: {adminViewingMedia.id}</span>
                  <span>Safety Status: Active Session Archiving</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Create Room
  const handleCreateRoom = async () => {
    if (!createName.trim()) {
      setApiError('Please enter a display name to host the game!');
      return;
    }
    setLoading(true);
    setApiError(null);
    try {
      const response = await fetch('/api/room/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          selectedCategories: createCategories,
          timerDuration: createTimer
        })
      });
      if (!response.ok) {
        let errorMessage = '';
        try {
          const errData = await response.json();
          errorMessage = errData.message;
        } catch {
          if (response.status === 404) {
            errorMessage = 'Room not found. Please double-check your 4-character code!';
          } else if (response.status === 400) {
            errorMessage = 'Invalid request. Please make sure all required fields are filled out.';
          } else if (response.status === 403) {
            errorMessage = 'Access denied. You do not have permission to perform this action.';
          } else if (response.status === 500) {
            errorMessage = 'Our game servers are experiencing some hiccups. Please try again in a few seconds!';
          } else {
            errorMessage = 'An unexpected server error occurred. Please try again!';
          }
        }
        setApiError(errorMessage || 'Could not create room.');
        return;
      }
      const data = await response.json();
      if (data.success) {
        setRoomId(data.roomId);
        setPlayerId(data.playerId);
        setPlayerSlot(data.slot);
        setPlayerName(createName);
        setGameState(data.state);

        // Save session
        sessionStorage.setItem('tod_playerId', data.playerId);
        sessionStorage.setItem('tod_roomId', data.roomId);
        sessionStorage.setItem('tod_slot', data.slot);
        sessionStorage.setItem('tod_playerName', createName);

        // Add room query param to URL
        window.history.pushState({}, '', `?room=${data.roomId}`);
      } else {
        setApiError(data.message || 'Could not create room.');
      }
    } catch (err: any) {
      setApiError(`Network connection failed: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // Join Room
  const handleJoinRoom = async () => {
    if (!joinCode.trim()) {
      setApiError('Please enter a valid 4-character Room Code!');
      return;
    }
    if (!joinName.trim()) {
      setApiError('Please enter your display name!');
      return;
    }
    setLoading(true);
    setApiError(null);
    try {
      const response = await fetch('/api/room/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: joinCode,
          name: joinName
        })
      });
      if (!response.ok) {
        let errorMessage = '';
        try {
          const errData = await response.json();
          errorMessage = errData.message;
        } catch {
          if (response.status === 404) {
            errorMessage = 'Room code not found. Please double-check your 4-letter code!';
          } else if (response.status === 400) {
            errorMessage = 'Invalid request. Please make sure all required fields are filled out.';
          } else if (response.status === 403) {
            errorMessage = 'Access denied. You do not have permission to perform this action.';
          } else if (response.status === 500) {
            errorMessage = 'Our game servers are experiencing some hiccups. Please try again in a few seconds!';
          } else {
            errorMessage = 'An unexpected server error occurred. Please try again!';
          }
        }
        setApiError(errorMessage || 'Could not join room.');
        return;
      }
      const data = await response.json();
      if (data.success) {
        setRoomId(data.roomId);
        setPlayerId(data.playerId);
        setPlayerSlot(data.slot);
        setPlayerName(joinName);
        setGameState(data.state);

        // Save session
        sessionStorage.setItem('tod_playerId', data.playerId);
        sessionStorage.setItem('tod_roomId', data.roomId);
        sessionStorage.setItem('tod_slot', data.slot);
        sessionStorage.setItem('tod_playerName', joinName);

        // Add room query param to URL
        window.history.pushState({}, '', `?room=${data.roomId}`);
      } else {
        setApiError(data.message || 'Could not join room. Is the code correct?');
      }
    } catch (err: any) {
      setApiError(`Network connection failed: ${err?.message || String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  // Send action to server
  const sendAction = async (action: string, payload: any = {}) => {
    if (!roomId || !playerId) return;
    try {
      const response = await fetch(`/api/room/${roomId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          playerId,
          payload
        })
      });
      const data = await response.json();
      if (data.success) {
        setGameState(data.state);
        setLocalTimerLeft(data.state.timerLeft);
      } else {
        alert(data.message || 'Action failed');
      }
    } catch (err) {
      console.error('Action transmission failed:', err);
    }
  };

  // Helper: Copy Invite Link
  const copyInviteLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLeave = () => {
    if (confirm("Are you sure you want to leave this game room?")) {
      sendAction('leave_room');
      clearSession();
      window.history.pushState({}, '', window.location.pathname);
    }
  };

  // Send transient view-once media
  const sendTransientMedia = async (file: File) => {
    if (!roomId || !playerId) return;

    if (file.size > 20 * 1024 * 1024) {
      setMediaSendingStatus('error');
      setMediaSendingMessage('File is too large! Please choose a file under 20MB.');
      return;
    }

    setMediaSendingStatus('reading');
    setMediaSendingMessage('Processing media file...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) {
        setMediaSendingStatus('error');
        setMediaSendingMessage('Failed to read the selected file.');
        return;
      }

      let mediaType: 'image' | 'video' | 'audio' = 'image';
      if (file.type.startsWith('video/')) {
        mediaType = 'video';
      } else if (file.type.startsWith('audio/')) {
        mediaType = 'audio';
      }

      setMediaSendingStatus('sending');
      setMediaSendingMessage('Transmitting disappearing media...');

      try {
        const response = await fetch(`/api/room/${roomId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataUrl,
            mediaType,
            playerId
          })
        });

        const resData = await response.json();
        if (resData.success) {
          setMediaSendingStatus('success');
          setMediaSendingMessage('Sent! Self-destructs after they view it.');
          setTimeout(() => setMediaSendingStatus('idle'), 4000);
        } else {
          setMediaSendingStatus('error');
          setMediaSendingMessage(resData.message || 'Transmission failed.');
        }
      } catch (err: any) {
        setMediaSendingStatus('error');
        setMediaSendingMessage(`Error: ${err?.message || String(err)}`);
      }
    };

    reader.onerror = () => {
      setMediaSendingStatus('error');
      setMediaSendingMessage('FileReader encountered an error.');
    };

    reader.readAsDataURL(file);
  };

  // View incoming transient media
  const viewTransientMedia = async () => {
    if (!roomId || !playerId) return;

    try {
      const response = await fetch(`/api/room/${roomId}/media?playerId=${playerId}`);
      if (!response.ok) {
        alert('Could not fetch the disappearing media. It may have already been viewed or destroyed.');
        setHasPendingMedia(false);
        return;
      }

      const resData = await response.json();
      if (resData.success) {
        setViewingMedia({
          dataUrl: resData.dataUrl,
          mediaType: resData.mediaType,
          senderName: resData.senderName
        });
        setHasPendingMedia(false);
        setPendingMediaSender('');
        setPendingMediaType(null);
      } else {
        alert(resData.message || 'Failed to retrieve media.');
      }
    } catch (err) {
      console.error('Failed to view media:', err);
      alert('Error loading media.');
    }
  };

  // Render Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-[#FCFAF0] text-zinc-950 flex flex-col justify-center items-center p-6 bg-[radial-gradient(#d1d5db_1px,transparent_1px)] [background-size:24px_24px]" id="app-loading">
        <div className="relative w-16 h-16 mb-4 flex items-center justify-center bg-[#FFDE4D] border-[3px] border-zinc-950 shadow-[4px_4px_0px_0px_#000] rounded-2xl animate-bounce">
          <Flame className="w-8 h-8 text-zinc-950 animate-pulse" />
        </div>
        <p className="font-display font-black text-lg text-zinc-950 uppercase tracking-tight">SYNCING PARTY HUB...</p>
        <p className="font-mono text-xs text-zinc-600 mt-1">Connecting to live sessions...</p>
      </div>
    );
  }

  // --- SCREEN 1: LOBBY JOIN OR CREATION (NEO-BRUTALIST OVERHAUL) ---
  if (!gameState) {
    return (
      <div className="min-h-screen bg-[#FCFAF0] text-zinc-950 flex flex-col justify-between relative overflow-hidden bg-[radial-gradient(#e4e4e7_1px,transparent_1px)] [background-size:20px_20px] p-4 sm:p-6" id="lobby-screen">
        
        {/* Playful Floating Retro Shapes */}
        <div className="absolute top-10 left-[10%] w-20 h-20 bg-[#4CC9F0] border-4 border-zinc-950 rounded-3xl -rotate-12 opacity-80 hidden md:block select-none shadow-[4px_4px_0px_0px_#000]"></div>
        <div className="absolute bottom-12 right-[8%] w-16 h-16 bg-[#06D6A0] border-4 border-zinc-950 rounded-full rotate-45 opacity-80 hidden md:block select-none shadow-[4px_4px_0px_0px_#000]"></div>
        
        <header className="w-full max-w-6xl mx-auto py-4 px-2 flex justify-between items-center relative z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 border-[3px] border-zinc-950 bg-[#06D6A0] text-zinc-950 flex items-center justify-center font-black rounded-2xl shadow-[4px_4px_0px_0px_#000] rotate-2">
              <Flame className="w-7 h-7 text-zinc-950 animate-pulse" />
            </div>
            <div>
              <span className="font-display font-black text-2xl tracking-tighter uppercase italic text-zinc-950 block leading-none">
                TRUTH <span className="text-[#FF5580]">OR</span> DARE
              </span>
              <span className="text-[10px] uppercase font-mono font-black text-zinc-600 tracking-wider">Online Sync Lounge</span>
            </div>
          </div>
          
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-3 bg-white hover:bg-zinc-100 border-[3px] border-zinc-950 rounded-2xl shadow-[4px_4px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all cursor-pointer"
            aria-label="Toggle sound effects"
            id="toggle-sound-btn"
          >
            {soundEnabled ? <Volume2 className="w-5 h-5 text-zinc-950" /> : <VolumeX className="w-5 h-5 text-zinc-400" />}
          </button>
        </header>

        <main className="w-full max-w-4xl mx-auto py-6 flex-1 flex flex-col justify-center relative z-10">
          <div className="text-center mb-10 max-w-2xl mx-auto">
            <div className="inline-block transform -rotate-1 bg-[#FFDE4D] border-[3px] border-zinc-950 px-4 py-1.5 rounded-2xl shadow-[3px_3px_0px_0px_#000] mb-4">
              <span className="font-mono text-xs font-black text-zinc-950 uppercase">🎉 NO LOGINS! CHOOSE A CODE & GO!</span>
            </div>
            
            <h1 className="font-display text-5xl sm:text-7xl font-black tracking-tight uppercase text-zinc-950 leading-none">
              TRUTH <span className="text-[#FF5580] italic">OR</span> DARE
            </h1>
            <p className="text-zinc-700 text-sm sm:text-base mt-4 font-medium leading-relaxed max-w-xl mx-auto font-sans">
              Connect in perfect real-time synchronization with a friend. Host a room, invite an opponent, write customized challenges or pick pre-made surprise categories. Full video, image, and chat integration!
            </p>
          </div>

          {apiError && (
            <div className="mb-8 p-4 bg-[#FF5580] border-[3px] border-zinc-950 text-zinc-950 rounded-2xl shadow-[4px_4px_0px_0px_#000] flex items-start gap-3 max-w-lg mx-auto" id="lobby-error">
              <Info className="w-6 h-6 shrink-0 text-zinc-950 mt-0.5" />
              <div>
                <p className="text-xs uppercase font-mono font-black">SYSTEM MESSAGE Alert:</p>
                <p className="text-sm font-black leading-snug">{apiError}</p>
              </div>
            </div>
          )}

          {/* SIDE BY SIDE BENTO BLOCKS */}
          <div className="grid md:grid-cols-2 gap-8 items-stretch max-w-4xl w-full mx-auto mt-2">
            {/* Create Room Block */}
            <div className="bg-[#FFDE4D] border-[3px] border-zinc-950 p-6 sm:p-8 rounded-3xl flex flex-col justify-between shadow-[8px_8px_0px_0px_#000]" id="create-room-card">
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-white rounded-xl border-2 border-zinc-950 flex items-center justify-center shadow-[2px_2px_0px_0px_#000]">
                    <Plus className="w-5 h-5 text-zinc-950" />
                  </div>
                  <h2 className="font-display font-black text-2xl uppercase text-zinc-950">Host a Game</h2>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-950 mb-1.5">Your Nickname</label>
                    <input 
                      type="text" 
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="e.g. Alex" 
                      className="w-full bg-white border-[3px] border-zinc-950 rounded-2xl px-4 py-3 text-zinc-950 font-bold outline-none shadow-[3px_3px_0px_0px_#000] focus:shadow-[5px_5px_0px_0px_#000] transition-all"
                      maxLength={15}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-950 mb-1.5">Game Categories</label>
                    <div className="flex gap-2 flex-wrap">
                      {(['general', 'fun', 'spicy'] as Category[]).map((cat) => {
                        const active = createCategories.includes(cat);
                        return (
                          <button
                            key={cat}
                            onClick={() => {
                              if (active) {
                                if (createCategories.length > 1) {
                                  setCreateCategories(createCategories.filter(c => c !== cat));
                                }
                              } else {
                                setCreateCategories([...createCategories, cat]);
                              }
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase border-2 transition-all flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_#000] hover:translate-x-px hover:translate-y-px hover:shadow-none active:translate-x-0.5 active:translate-y-0.5 ${
                              active 
                                ? 'bg-[#FF5580] text-white border-zinc-950' 
                                : 'bg-white border-zinc-950 text-zinc-800'
                            }`}
                          >
                            {cat === 'spicy' && <Flame className="w-3.5 h-3.5" />}
                            {cat === 'fun' && <Laugh className="w-3.5 h-3.5" />}
                            {cat === 'general' && <Sparkles className="w-3.5 h-3.5" />}
                            {cat}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-950 mb-1.5">Timer Limit: {createTimer}s</label>
                    <div className="flex gap-1.5 bg-white p-1 rounded-2xl border-[3px] border-zinc-950 shadow-[3px_3px_0px_0px_#000]">
                      {[30, 45, 60, 90].map((sec) => (
                        <button
                          key={sec}
                          onClick={() => setCreateTimer(sec)}
                          className={`flex-1 py-1.5 rounded-xl text-xs font-black uppercase border-2 transition-all cursor-pointer ${
                            createTimer === sec
                              ? 'bg-[#06D6A0] text-zinc-950 border-zinc-950'
                              : 'bg-transparent border-transparent text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCreateRoom}
                className="w-full mt-6 bg-[#FF5580] hover:bg-[#ff3c6c] text-white font-display font-black text-lg py-4 rounded-2xl shadow-[4px_4px_0px_0px_#000] border-[3px] border-zinc-950 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all cursor-pointer text-center uppercase"
                id="create-room-btn"
              >
                Host Lobby →
              </button>
            </div>

            {/* Join Room Block */}
            <div className="bg-[#4CC9F0] border-[3px] border-zinc-950 p-6 sm:p-8 rounded-3xl flex flex-col justify-between shadow-[8px_8px_0px_0px_#000]" id="join-room-card">
              <div>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-white rounded-xl border-2 border-zinc-950 flex items-center justify-center shadow-[2px_2px_0px_0px_#000]">
                    <UserPlus className="w-5 h-5 text-zinc-950" />
                  </div>
                  <h2 className="font-display font-black text-2xl uppercase text-zinc-950">Join Game</h2>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-950 mb-1.5">Enter Room Code</label>
                    <input 
                      type="text" 
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="ABCD" 
                      className="w-full bg-white border-[3px] border-zinc-950 rounded-2xl px-4 py-3 text-zinc-950 font-mono font-black tracking-widest text-center text-2xl uppercase outline-none shadow-[3px_3px_0px_0px_#000] focus:shadow-[5px_5px_0px_0px_#000] transition-all"
                      maxLength={4}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-zinc-950 mb-1.5">Your Nickname</label>
                    <input 
                      type="text" 
                      value={joinName}
                      onChange={(e) => setJoinName(e.target.value)}
                      placeholder="e.g. Taylor" 
                      className="w-full bg-white border-[3px] border-zinc-950 rounded-2xl px-4 py-3 text-zinc-950 font-bold outline-none shadow-[3px_3px_0px_0px_#000] focus:shadow-[5px_5px_0px_0px_#000] transition-all"
                      maxLength={15}
                    />
                  </div>
                </div>

                <div className="mt-5 p-3.5 bg-white border-[3px] border-zinc-950 rounded-2xl text-zinc-800 text-xs leading-relaxed flex items-start gap-2.5 font-sans font-medium shadow-[2px_2px_0px_0px_#000]">
                  <Info className="w-4.5 h-4.5 text-[#FF5580] shrink-0 mt-0.5" />
                  <span>The room code is a 4-letter sequence. If you came from an invite url, it is loaded!</span>
                </div>
              </div>

              <button
                onClick={handleJoinRoom}
                className="w-full mt-6 bg-white hover:bg-zinc-100 text-zinc-950 font-display font-black text-lg py-4 rounded-2xl shadow-[4px_4px_0px_0px_#000] border-[3px] border-zinc-950 hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all cursor-pointer text-center uppercase"
                id="join-room-btn"
              >
                Join Party Lobby →
              </button>
            </div>
          </div>
        </main>

        <footer className="w-full text-center py-6 text-zinc-500 text-xs border-t-2 border-zinc-200 mt-8 font-mono flex flex-col sm:flex-row justify-between items-center max-w-6xl mx-auto gap-3 shrink-0">
          <p>© 2026 TRUTH OR DARE LIVE PARTY CONSOLE • REAL-TIME WEB SYNCED.</p>
          <button 
            onClick={() => setIsAdminOpen(true)}
            className="px-3 py-1 bg-zinc-950 text-[#06D6A0] border-2 border-zinc-950 hover:bg-zinc-900 rounded-lg text-[10px] font-black uppercase tracking-widest cursor-pointer shadow-[2px_2px_0px_0px_#000] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
          >
            🕵️ Admin Console Decryption
          </button>
        </footer>
        {renderAdminModal()}
      </div>
    );
  }

  // --- SCREEN 2: ACTIVE GAME SESSION ---
  const { player1, player2, spectators } = gameState.players;
  const isPlayer1 = playerSlot === 'player1';
  const isPlayer2 = playerSlot === 'player2';
  const isSpectator = playerSlot === 'spectator';
  
  const myPlayer = isPlayer1 ? player1 : isPlayer2 ? player2 : spectators.find(s => s.id === playerId);
  const activeTurnPlayer = gameState.turn === 'player1' ? player1 : player2;
  const isMyTurn = (isPlayer1 && gameState.turn === 'player1') || (isPlayer2 && gameState.turn === 'player2');

  const opponentSlot = gameState.turn === 'player1' ? 'player2' : 'player1';
  const opponentPlayerObj = opponentSlot === 'player1' ? player1 : player2;
  const isOpponent = playerSlot === opponentSlot;
  
  // Calculate timer stroke dash-offset
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const percentageLeft = gameState.timerDuration > 0 ? (localTimerLeft / gameState.timerDuration) : 0;
  const strokeDashoffset = circumference - (percentageLeft * circumference);

  // Timer color
  let timerRingColor = 'stroke-[#06D6A0]';
  if (percentageLeft < 0.25) {
    timerRingColor = 'stroke-[#FF5580]';
  } else if (percentageLeft < 0.5) {
    timerRingColor = 'stroke-[#FFDE4D]';
  }

  return (
    <div className="min-h-screen bg-[#FCFAF0] text-zinc-950 flex flex-col bg-[radial-gradient(#e4e4e7_1px,transparent_1px)] [background-size:20px_20px]" id="game-screen">
      {/* Real-time Game Header */}
      <header className="bg-white border-b-4 border-zinc-950 sticky top-0 z-30 shadow-[0_4px_0px_0px_rgba(9,9,11,1)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col md:flex-row gap-4 justify-between items-center">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 border-[3px] border-zinc-950 bg-[#06D6A0] text-zinc-950 flex items-center justify-center font-black rounded-xl shadow-[3px_3px_0px_0px_#000] rotate-1">
              <Flame className="w-6 h-6 text-zinc-950" />
            </div>
            <div className="text-left">
              <span className="font-display font-black text-xl tracking-tight text-zinc-950 block">TRUTH <span className="text-[#FF5580]">OR</span> DARE</span>
              <span 
                onClick={() => setIsAdminOpen(true)}
                className="inline-block mt-0.5 px-2 py-0.5 text-[9px] uppercase font-mono font-black bg-[#FFDE4D] text-zinc-950 border-2 border-zinc-950 rounded shadow-[1px_1px_0px_0px_#000] cursor-pointer hover:bg-yellow-400 transition"
                title="Admin Decrypt Console"
              >
                ROOM: {gameState.roomId}
              </span>
            </div>
          </div>

          {/* Lobby Synchronization Details / Share Link */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Copy code button */}
            <button
              onClick={copyInviteLink}
              className="flex items-center gap-2 px-3.5 py-2 bg-[#FFDE4D] hover:bg-yellow-400 border-[3px] border-zinc-950 rounded-xl text-xs font-black uppercase shadow-[3px_3px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all cursor-pointer"
              title="Copy link to invite friend"
              id="copy-invite-btn"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-zinc-950" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-zinc-950" />
                  <span>Invite Opponent</span>
                </>
              )}
            </button>

            {/* Sound Toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="p-2.5 bg-white hover:bg-zinc-50 border-[3px] border-zinc-950 rounded-xl shadow-[3px_3px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all cursor-pointer"
              title="Toggle Audio Cues"
              id="game-sound-toggle"
            >
              {soundEnabled ? <Volume2 className="w-4.5 h-4.5 text-zinc-950" /> : <VolumeX className="w-4.5 h-4.5 text-zinc-400" />}
            </button>

            {/* Leave Room */}
            <button
              onClick={handleLeave}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#FF5580] hover:bg-[#ff3c6c] text-white rounded-xl text-xs font-black uppercase border-[3px] border-zinc-950 shadow-[3px_3px_0px_0px_#000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all cursor-pointer"
              id="leave-btn"
            >
              <LogOut className="w-4 h-4" />
              <span>Exit Lobby</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Game Interface */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-12 gap-6 items-start">
        
        {/* COLUMN 1: SOCIAL HUB (3 cols) - Interactive players and live room chat */}
        <div className="lg:col-span-3 lg:order-1 order-2 space-y-6">
          
          {/* 2-Player Versus Cards */}
          <div className="bg-white border-[3px] border-zinc-950 rounded-3xl p-4 shadow-[5px_5px_0px_0px_#000]" id="players-card">
            <h3 className="font-display font-black text-sm uppercase tracking-tight text-zinc-950 mb-3 flex items-center gap-2">
              <Users className="w-4.5 h-4.5 text-indigo-500" /> ACTIVE PLAYERS
            </h3>
            
            <div className="grid grid-cols-2 gap-3 relative">
              <div className="absolute inset-y-0 left-1/2 w-0.5 bg-zinc-200 -translate-x-1/2 hidden xs:block"></div>

              {/* Player 1 Details */}
              <div className={`p-3 rounded-2xl flex flex-col items-center text-center border-2 transition-all duration-200 ${
                gameState.turn === 'player1' 
                  ? 'bg-[#FFDE4D] border-zinc-950 shadow-[3px_3px_0px_0px_#000]' 
                  : 'bg-zinc-50 border-zinc-200'
              }`} id="slot-player1-info">
                <div className="relative">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-base font-black border-2 border-zinc-950 shadow-[2px_2px_0px_0px_#000] ${
                    player1 ? 'bg-indigo-100 text-indigo-800' : 'bg-zinc-100 text-zinc-400 border-dashed'
                  }`}>
                    {player1 ? player1.name.charAt(0).toUpperCase() : '?'}
                  </div>
                  {player1 && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#06D6A0] border-2 border-zinc-950" title="Online"></span>
                  )}
                </div>
                
                <p className="mt-2 text-xs font-black uppercase truncate max-w-full text-zinc-950 leading-none">
                  {player1 ? player1.name : 'Waiting...'}
                </p>
                <span className="text-[8px] font-bold uppercase text-zinc-500 tracking-wider block mt-0.5">P1 (Host)</span>
                
                <div className="mt-1.5 text-xl font-black text-zinc-950 font-mono" id="player1-score">
                  {gameState.scores.player1} <span className="text-[9px] font-normal font-sans lowercase text-zinc-600">pts</span>
                </div>
              </div>

              {/* Player 2 Details */}
              <div className={`p-3 rounded-2xl flex flex-col items-center text-center border-2 transition-all duration-200 ${
                gameState.turn === 'player2' 
                  ? 'bg-[#FFDE4D] border-zinc-950 shadow-[3px_3px_0px_0px_#000]' 
                  : 'bg-zinc-50 border-zinc-200'
              }`} id="slot-player2-info">
                <div className="relative">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center text-base font-black border-2 border-zinc-950 shadow-[2px_2px_0px_0px_#000] ${
                    player2 ? 'bg-rose-100 text-[#FF5580]' : 'bg-zinc-100 text-zinc-400 border-dashed'
                  }`}>
                    {player2 ? player2.name.charAt(0).toUpperCase() : '?'}
                  </div>
                  {player2 && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#06D6A0] border-2 border-zinc-950" title="Online"></span>
                  )}
                </div>
                
                <p className="mt-2 text-xs font-black uppercase truncate max-w-full text-zinc-950 leading-none">
                  {player2 ? player2.name : 'Waiting...'}
                </p>
                <span className="text-[8px] font-bold uppercase text-zinc-500 tracking-wider block mt-0.5">P2 (Opponent)</span>
                
                <div className="mt-1.5 text-xl font-black text-zinc-950 font-mono" id="player2-score">
                  {gameState.scores.player2} <span className="text-[9px] font-normal font-sans lowercase text-zinc-600">pts</span>
                </div>
              </div>
            </div>

            {/* Invite notification when P2 is missing */}
            {!player2 && (
              <div className="mt-3.5 p-3.5 bg-[#FFDE4D]/20 border-2 border-dashed border-[#FFDE4D] rounded-2xl flex flex-col items-center text-center gap-2" id="invite-alert-box">
                <p className="text-[10px] text-zinc-700 font-mono font-black uppercase">📣 WAITING FOR PARTNER</p>
                <p className="text-[11px] text-zinc-600 font-medium leading-snug">Tap the Invite button in the header and send the URL to start playing!</p>
                <button
                  onClick={copyInviteLink}
                  className="px-3.5 py-1.5 bg-[#FFDE4D] hover:bg-yellow-400 text-zinc-950 text-[10px] font-black uppercase rounded-lg border-2 border-zinc-950 shadow-[2px_2px_0px_0px_#000] transition active:translate-y-px active:shadow-none cursor-pointer"
                >
                  Get Invite Link
                </button>
              </div>
            )}
          </div>

          {/* INDEPENDENT ROOM CHAT */}
          <div className="bg-white border-[3px] border-zinc-950 rounded-3xl p-4 shadow-[5px_5px_0px_0px_#000] flex flex-col h-[340px]" id="room-chat-card">
            <h3 className="font-display font-black text-sm uppercase tracking-tight text-zinc-950 mb-2.5 flex items-center gap-2">
              <MessageSquare className="w-4.5 h-4.5 text-[#FF5580]" /> PARTY CHAT
            </h3>
            
            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 mb-2.5 scrollbar-thin scrollbar-thumb-zinc-300 text-left" id="chat-messages-scroll">
              {!gameState.chatMessages || gameState.chatMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                  <p className="text-2xl mb-1">💬</p>
                  <p className="text-[10px] text-zinc-500 uppercase font-mono font-black tracking-wider">No comments yet. Say hello!</p>
                </div>
              ) : (
                gameState.chatMessages.map((msg) => {
                  const isMe = msg.senderName === myPlayer?.name;
                  return (
                    <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-1 mb-0.5 text-[8px] font-black text-zinc-500 uppercase tracking-wider">
                        <span className={msg.senderSlot === 'player1' ? 'text-indigo-600' : msg.senderSlot === 'player2' ? 'text-[#FF5580]' : 'text-zinc-600'}>
                          {msg.senderName} {msg.senderSlot === 'spectator' && '(Spectator)'}
                        </span>
                        <span>•</span>
                        <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className={`px-3 py-1.5 rounded-2xl text-xs max-w-[85%] break-words border-2 border-zinc-950 shadow-[2px_2px_0px_0px_#000] ${
                        isMe 
                          ? 'bg-[#FFDE4D] text-zinc-950 rounded-tr-none' 
                          : 'bg-zinc-50 text-zinc-900 rounded-tl-none'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Send Input Form */}
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const input = form.elements.namedItem('chatInput') as HTMLInputElement;
                const text = input.value?.trim();
                if (text) {
                  sendAction('send_chat', { text });
                  input.value = '';
                }
              }}
              className="flex gap-1.5"
            >
              <input
                name="chatInput"
                type="text"
                placeholder="Type your message..."
                className="flex-1 bg-white border-2 border-zinc-950 rounded-xl px-3 py-2 text-xs text-zinc-950 font-medium outline-none focus:bg-zinc-50"
                maxLength={300}
                autoComplete="off"
              />
              <button
                type="submit"
                className="px-3 bg-[#06D6A0] border-2 border-zinc-950 hover:bg-[#04c290] rounded-xl transition cursor-pointer flex items-center justify-center text-zinc-950 shadow-[2px_2px_0px_0px_#000] active:translate-y-px active:shadow-none"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>

        {/* COLUMN 2: PLAYBOARD ARENA (6 cols) */}
        <div className="lg:col-span-6 lg:order-2 order-1 space-y-6">
          
          {/* Live Game Status & Logs banner */}
          <div className="bg-[#4CC9F0] border-[3px] border-zinc-950 px-4 py-2.5 rounded-2xl flex items-center justify-between text-xs font-bold text-zinc-950 shadow-[3px_3px_0px_0px_#000]" id="status-feed-banner">
            <span className="flex items-center gap-2 truncate text-zinc-950 uppercase tracking-tight">
              <span className="w-2.5 h-2.5 rounded-full bg-zinc-950 animate-ping shrink-0"></span>
              <span className="truncate">{gameState.lastActionMessage}</span>
            </span>
            <span className="font-mono text-zinc-950 bg-white border-2 border-zinc-950 px-2 py-0.5 rounded-lg shadow-[1px_1px_0px_0px_#000] text-[10px] shrink-0 ml-2">ROUND {gameState.roundCount}</span>
          </div>

          {/* PLAYBOARD CONTAINER (TACTILE ARENA) */}
          <div className="bg-white border-[3px] border-zinc-950 rounded-[2.5rem] p-5 sm:p-8 relative overflow-hidden shadow-[8px_8px_0px_0px_rgba(9,9,11,1)]" id="game-arena">
            
            {/* Turn Announcement Banner */}
            <div className="text-center mb-6">
              <div className="inline-block transform -rotate-1 mb-2">
                <span className={`px-4.5 py-1.5 rounded-2xl border-2 border-zinc-950 text-xs font-black tracking-wider uppercase inline-flex items-center gap-1.5 shadow-[2px_2px_0px_0px_#000] ${
                  isMyTurn 
                    ? 'bg-[#FF5580] text-white' 
                    : 'bg-zinc-100 text-zinc-600'
                }`}>
                  {isMyTurn ? (
                    <>
                      <Flame className="w-3.5 h-3.5 animate-bounce" /> YOUR TURN
                    </>
                  ) : (
                    <>
                      WAITING FOR {activeTurnPlayer?.name?.toUpperCase() || 'PARTNER'}
                    </>
                  )}
                </span>
              </div>

              <h2 className="font-display font-black text-3xl sm:text-4xl text-zinc-950 mt-2 leading-none uppercase">
                {isMyTurn ? "Select Truth or Dare!" : `${activeTurnPlayer?.name?.toUpperCase() || 'PARTNER'}'S MOVE`}
              </h2>
              <p className="text-zinc-600 text-xs mt-1.5 font-bold">
                {isMyTurn ? "Will you confess a dirty secret or take a wild, funny risk?" : "Get ready! They are deciding which destiny to select..."}
              </p>
            </div>

            {/* STAGE A: SELECTION MODE (Active player chooses category 'truth' or 'dare') */}
            {!gameState.currentSelection ? (
              <div className="space-y-6 w-full" id="selection-stage-container">
                <div className="grid sm:grid-cols-2 gap-5 mt-6 max-w-xl mx-auto" id="choices-grid">
                  {/* TRUTH SELECTOR BUTTON */}
                  <button
                    disabled={!isMyTurn}
                    onClick={() => {
                      sendAction('select_choice', { choice: 'truth' });
                    }}
                    className={`relative group rounded-3xl p-5 sm:p-6 flex flex-col items-center text-center border-4 transition-all duration-150 ${
                      isMyTurn 
                        ? 'bg-[#FFDE4D] text-zinc-950 border-zinc-950 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none cursor-pointer' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-400 opacity-70'
                    }`}
                    id="choose-truth-btn"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white border-2 border-zinc-950 flex items-center justify-center mb-4 shadow-[2px_2px_0px_0px_#000] group-hover:scale-105 transition-all">
                      <HelpCircle className={`w-7 h-7 ${isMyTurn ? 'text-zinc-950' : 'text-zinc-400'}`} />
                    </div>
                    
                    <h3 className="font-display font-black text-2xl mb-1.5 uppercase">TRUTH</h3>
                    <p className="text-[11px] text-zinc-800 font-bold leading-normal max-w-xs font-sans">
                      Reveal your deepest secrets, confess hilarious thoughts, or face delicious embarrassment.
                    </p>
                    
                    {isMyTurn && (
                      <div className="mt-4 bg-white px-3 py-1 rounded-xl border-2 border-zinc-950 text-xs font-black uppercase flex items-center gap-0.5 shadow-[1.5px_1.5px_0px_0px_#000]">
                        Choose Truth <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </button>

                  {/* DARE SELECTOR BUTTON */}
                  <button
                    disabled={!isMyTurn}
                    onClick={() => {
                      sendAction('select_choice', { choice: 'dare' });
                    }}
                    className={`relative group rounded-3xl p-5 sm:p-6 flex flex-col items-center text-center border-4 transition-all duration-150 ${
                      isMyTurn 
                        ? 'bg-[#FF5580] text-white border-zinc-950 shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none cursor-pointer' 
                        : 'bg-zinc-50 border-zinc-200 text-zinc-400 opacity-70'
                    }`}
                    id="choose-dare-btn"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-white border-2 border-zinc-950 flex items-center justify-center mb-4 shadow-[2px_2px_0px_0px_#000] group-hover:scale-105 transition-all">
                      <Flame className={`w-7 h-7 ${isMyTurn ? 'text-[#FF5580]' : 'text-zinc-400'}`} />
                    </div>
                    
                    <h3 className="font-display font-black text-2xl mb-1.5 uppercase">DARE</h3>
                    <p className="text-[11px] text-zinc-100 font-bold leading-normal max-w-xs font-sans">
                      Perform funny online-optimized challenges, complete stunts, or execute courageous acts!
                    </p>
                    
                    {isMyTurn && (
                      <div className="mt-4 bg-white text-zinc-950 px-3 py-1 rounded-xl border-2 border-zinc-950 text-xs font-black uppercase flex items-center gap-0.5 shadow-[1.5px_1.5px_0px_0px_#000]">
                        Choose Dare <ChevronRight className="w-3.5 h-3.5 text-[#FF5580]" />
                      </div>
                    )}
                  </button>
                </div>

                {/* DYNAMIC LAST TURN CONFESSION BANNER */}
                {gameState.currentReply && (
                  <div className="max-w-xl mx-auto p-4 bg-[#06D6A0]/10 border-2 border-zinc-950 rounded-2xl relative overflow-hidden shadow-[3px_3px_0px_0px_#000] text-left" id="last-turn-answer-box">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Send className="w-4.5 h-4.5 text-[#04c290]" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-700">LAST TRANSLATED CONFESSION</span>
                    </div>
                    <p className="text-xs font-bold text-zinc-900 italic leading-relaxed">
                      "{gameState.currentReply}"
                    </p>
                  </div>
                )}
              </div>
            ) : (
              // STAGE B: GAME SELECTED TRUTH OR DARE IS REGISTERED
              // Now we split based on whether a question is assigned yet!
              !gameState.currentQuestion ? (
                /* ==================== STAGE B2: OPPONENT ASSIGN QUESTION PROMPT ==================== */
                <div className="max-w-xl mx-auto bg-zinc-50 border-[3px] border-zinc-950 rounded-3xl p-5 sm:p-6 text-center space-y-5 shadow-[4px_4px_0px_0px_#000]" id="custom-choice-prompt">
                  <div className="flex justify-between items-center border-b-2 border-zinc-200 pb-3">
                    <span className={`px-3 py-1 rounded-lg border-2 border-zinc-950 text-xs font-black uppercase tracking-wider shadow-[1.5px_1.5px_0px_0px_#000] ${
                      gameState.currentSelection === 'truth' ? 'bg-[#FFDE4D] text-zinc-950' : 'bg-[#FF5580] text-white'
                    }`}>
                      {gameState.currentSelection.toUpperCase()} SELECTED
                    </span>
                    <span className="text-zinc-500 font-mono text-[10px] font-bold">STATUS: WAITING ASSIGNMENT</span>
                  </div>

                  {isOpponent ? (
                    /* Only visible to the opponent, who holds the assignment power */
                    <div className="space-y-4">
                      <h3 className="font-display font-black text-2xl text-zinc-950 tracking-tight uppercase leading-none">
                        🔥 YOU HAVE THE POWER!
                      </h3>
                      <p className="text-zinc-700 text-xs font-bold leading-relaxed max-w-sm mx-auto">
                        Your opponent selected <strong>{gameState.currentSelection.toUpperCase()}</strong>. You get to decide: choose an in-built surprise question or draft a custom one!
                      </p>

                      {!showCustomWriter ? (
                        <div className="grid sm:grid-cols-2 gap-4 pt-2">
                          {/* OPTION 1: IN-BUILT RANDOM */}
                          <button
                            onClick={() => {
                              sendAction('assign_question');
                            }}
                            className="bg-white border-[3px] border-zinc-950 hover:bg-zinc-50 rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer shadow-[3px_3px_0px_0px_#000] active:translate-y-px active:shadow-none transition-all"
                          >
                            <div className="w-10 h-10 rounded-xl bg-[#FFDE4D] border-2 border-zinc-950 flex items-center justify-center text-xl mb-2.5 shadow-[1.5px_1.5px_0px_0px_#000]">
                              🎲
                            </div>
                            <span className="font-black text-zinc-950 text-xs uppercase">In-built Surprise</span>
                            <span className="text-[9.5px] text-zinc-600 font-medium mt-1 leading-snug">Generate an online-optimized prompt from our library.</span>
                          </button>

                          {/* OPTION 2: WRITE YOUR OWN CUSTOM */}
                          <button
                            onClick={() => {
                              setShowCustomWriter(true);
                            }}
                            className="bg-white border-[3px] border-zinc-950 hover:bg-zinc-50 rounded-2xl p-4 flex flex-col items-center text-center cursor-pointer shadow-[3px_3px_0px_0px_#000] active:translate-y-px active:shadow-none transition-all"
                          >
                            <div className="w-10 h-10 rounded-xl bg-[#4CC9F0] border-2 border-zinc-950 flex items-center justify-center text-xl mb-2.5 shadow-[1.5px_1.5px_0px_0px_#000]">
                              ✍️
                            </div>
                            <span className="font-black text-zinc-950 text-xs uppercase">Write Custom Challenge</span>
                            <span className="text-[9.5px] text-zinc-600 font-medium mt-1 leading-snug">Draft a cheeky personalized text specifically for them.</span>
                          </button>
                        </div>
                      ) : (
                        <div className="pt-2 border-t-2 border-zinc-200 text-left space-y-3">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black uppercase text-zinc-500">
                              Write customized {gameState.currentSelection}:
                            </label>
                            <button 
                              onClick={() => setShowCustomWriter(false)}
                              className="text-[10px] font-black text-indigo-600 hover:underline uppercase"
                            >
                              ← Back to choice
                            </button>
                          </div>
                          
                          <textarea
                            value={opponentCustomDraft}
                            onChange={(e) => setOpponentCustomDraft(e.target.value)}
                            placeholder={`e.g., "Send a photo of your computer setup" or "Confess your biggest secret crush..."`}
                            className="w-full min-h-[90px] bg-white border-[3px] border-zinc-950 rounded-2xl px-3.5 py-2.5 text-xs text-zinc-950 font-bold outline-none shadow-[2px_2px_0px_0px_#000]"
                            maxLength={300}
                          />

                          <button
                            onClick={() => {
                              const trimmed = opponentCustomDraft.trim();
                              if (!trimmed) return;
                              sendAction('assign_question', { customText: trimmed });
                            }}
                            disabled={!opponentCustomDraft.trim()}
                            className="w-full py-2.5 bg-[#06D6A0] hover:bg-[#04c290] border-2 border-zinc-950 text-zinc-950 font-black text-xs uppercase rounded-xl shadow-[2px_2px_0px_0px_#000] disabled:opacity-50 transition"
                          >
                            Assign Custom {gameState.currentSelection.toUpperCase()} →
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Visible to the active player or spectators who are waiting for opponent */
                    <div className="space-y-4 py-4 flex flex-col items-center">
                      <div className="w-12 h-12 bg-[#FFDE4D] rounded-full border-2 border-zinc-950 flex items-center justify-center text-2xl animate-spin">
                        ⏳
                      </div>
                      <h3 className="font-display font-black text-xl text-zinc-950 uppercase">
                        PREPARE YOURSELF!
                      </h3>
                      <p className="text-zinc-700 text-xs font-bold leading-normal max-w-sm">
                        {isMyTurn ? (
                          <>
                            You selected <strong>{gameState.currentSelection.toUpperCase()}</strong>! Waiting for <strong>{opponentPlayerObj?.name || 'your opponent'}</strong> to assign or draft your question...
                          </>
                        ) : (
                          <>
                            <strong>{activeTurnPlayer?.name}</strong> selected <strong>{gameState.currentSelection.toUpperCase()}</strong>! Waiting for <strong>{opponentPlayerObj?.name || 'their opponent'}</strong> to assign the prompt...
                          </>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                /* ==================== STAGE B3: ACTIVE QUESTION / TASK MODE ==================== */
                <div className="space-y-5 mt-4 max-w-xl mx-auto" id="active-question-board">
                  {/* Question Card */}
                  <div className="p-5 sm:p-6 rounded-3xl border-[3px] border-zinc-950 bg-white text-center relative shadow-[5px_5px_0px_0px_#000]">
                    
                    {/* Category and Type badges */}
                    <div className="flex justify-between items-center mb-5 pb-3 border-b-2 border-zinc-100">
                      <span className={`px-3 py-1 rounded-lg border-2 border-zinc-950 text-xs font-black uppercase shadow-[1.5px_1.5px_0px_0px_#000] ${
                        gameState.currentSelection === 'truth' ? 'bg-[#FFDE4D] text-zinc-950' : 'bg-[#FF5580] text-white'
                      }`}>
                        {gameState.currentSelection.toUpperCase()}
                      </span>

                      <span className="px-2.5 py-1 rounded-xl bg-zinc-50 text-zinc-800 border-2 border-zinc-200 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                        {gameState.currentQuestion?.category === 'spicy' && <Flame className="w-3.5 h-3.5 text-[#FF5580]" />}
                        {gameState.currentQuestion?.category === 'fun' && <Laugh className="w-3.5 h-3.5 text-amber-500" />}
                        {gameState.currentQuestion?.category === 'general' && <Sparkles className="w-3.5 h-3.5 text-[#4CC9F0]" />}
                        {gameState.currentQuestion?.category} Category
                      </span>
                    </div>

                    {/* Question Text */}
                    <div className="min-h-[100px] flex flex-col items-center justify-center px-2">
                      {isCustomizingQuestion ? (
                        <div className="w-full max-w-md space-y-2.5 text-left">
                          <textarea
                            value={customQuestionText}
                            onChange={(e) => setCustomQuestionText(e.target.value)}
                            placeholder="Fine tune the question text..."
                            className="w-full min-h-[80px] bg-white border-[3px] border-zinc-950 rounded-2xl px-3 py-2.5 text-xs text-zinc-950 font-bold outline-none shadow-[2px_2px_0px_0px_#000]"
                            maxLength={300}
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                setIsCustomizingQuestion(false);
                                setCustomQuestionText(gameState.currentQuestion?.text || '');
                              }}
                              className="px-3.5 py-1.5 bg-zinc-150 hover:bg-zinc-200 text-zinc-700 font-black text-[10px] uppercase rounded-xl border-2 border-zinc-950 shadow-[1.5px_1.5px_0px_0px_#000] transition active:shadow-none cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={async () => {
                                if (customQuestionText.trim()) {
                                  await sendAction('set_custom_question', { text: customQuestionText });
                                  setIsCustomizingQuestion(false);
                                }
                              }}
                              className="px-3.5 py-1.5 bg-[#06D6A0] text-zinc-950 font-black text-[10px] uppercase rounded-xl border-2 border-zinc-950 shadow-[1.5px_1.5px_0px_0px_#000] transition hover:bg-[#04c290] cursor-pointer"
                            >
                              Save Challenge
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center">
                          <p className="font-display font-black text-2xl sm:text-3xl text-zinc-950 leading-tight uppercase">
                            "{gameState.currentQuestion?.text}"
                          </p>
                          
                          {!isSpectator && (
                            <div className="mt-4">
                              <button
                                onClick={() => {
                                  setIsCustomizingQuestion(true);
                                  setCustomQuestionText(gameState.currentQuestion?.text || '');
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-50 hover:bg-zinc-100 text-[10px] text-zinc-700 hover:text-zinc-950 rounded-xl border-2 border-zinc-300 transition cursor-pointer font-black uppercase shadow-[1px_1px_0px_0px_#000] active:translate-y-px active:shadow-none"
                              >
                                ✏️ Edit Challenge Text
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ACTIVE SYNCHRONIZED TIMER */}
                    <div className="mt-6 flex flex-col items-center justify-center pt-4 border-t-2 border-zinc-100">
                      <div className="relative w-18 h-18">
                        {/* Ring SVG */}
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                          <circle 
                            cx="50" 
                            cy="50" 
                            r={radius} 
                            className="stroke-zinc-100 fill-none" 
                            strokeWidth="8"
                          />
                          <circle 
                            cx="50" 
                            cy="50" 
                            r={radius} 
                            className={`fill-none transition-all duration-300 ${timerRingColor}`} 
                            strokeWidth="8"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                          />
                        </svg>
                        {/* Timer Display Text */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="font-display font-black text-2xl text-zinc-950 italic leading-none">
                            {localTimerLeft}
                          </span>
                          <span className="text-[7px] uppercase font-mono font-black text-zinc-500 tracking-wider">sec</span>
                        </div>
                      </div>

                      {/* Timer Controls (Available to players) */}
                      {!isSpectator && (
                        <div className="flex items-center gap-2 mt-2.5 bg-zinc-100 px-3 py-1 rounded-full border-2 border-zinc-950 shadow-[1.5px_1.5px_0px_0px_#000]">
                          <button
                            onClick={() => sendAction(gameState.timerActive ? 'pause_timer' : 'start_timer')}
                            className="p-1 hover:bg-zinc-200 rounded-full transition cursor-pointer text-zinc-800"
                            title={gameState.timerActive ? "Pause Timer" : "Resume Timer"}
                            id="play-pause-timer-btn"
                          >
                            {gameState.timerActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current text-[#06D6A0]" />}
                          </button>
                          <button
                            onClick={() => sendAction('reset_timer')}
                            className="p-1 hover:bg-zinc-200 rounded-full transition cursor-pointer text-zinc-500 hover:text-zinc-800"
                            title="Reset Timer"
                            id="reset-timer-btn"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Synchronized Live Reply Section */}
                    <div className="mt-5 border-t-2 border-zinc-100 pt-5 text-left animate-fade-in" id="synchronized-reply-section">
                      <h4 className="text-[10px] font-mono font-black uppercase text-zinc-500 mb-2.5 flex items-center gap-1">
                        <Send className="w-3.5 h-3.5 text-[#06D6A0]" /> RESPONSE TRANSCRIPT
                      </h4>

                      {gameState.currentReply ? (
                        <div className="bg-zinc-50 border-2 border-zinc-950 p-4 rounded-2xl relative overflow-hidden text-left shadow-[2px_2px_0px_0px_#000]" id="reply-container">
                          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-wide mb-1">
                            {activeTurnPlayer?.name || 'Player'}'s Confession:
                          </p>
                          <p className="text-xs font-bold text-zinc-950 italic">
                            "{gameState.currentReply}"
                          </p>
                        </div>
                      ) : (
                        <div className="bg-zinc-50/50 border-2 border-dashed border-zinc-200 p-4 rounded-2xl text-center" id="no-reply-yet">
                          <p className="text-xs text-zinc-500 italic">
                            Waiting for {activeTurnPlayer?.name || 'Player'} to write a response...
                          </p>
                        </div>
                      )}

                      {/* Input Reply Box for Active Player */}
                      {isMyTurn && (
                        <div className="mt-3.5 space-y-2.5" id="active-reply-editor">
                          <textarea
                            value={myReply}
                            onChange={(e) => setMyReply(e.target.value)}
                            placeholder="Type your reply, confession, or stunt outcome here..."
                            className="w-full min-h-[60px] bg-white border-2 border-zinc-950 rounded-2xl px-3.5 py-2.5 text-xs text-zinc-950 font-bold outline-none shadow-[2px_2px_0px_0px_#000] focus:shadow-[4px_4px_0px_0px_#000] transition-all"
                            id="reply-textarea-input"
                          />
                          <button
                            onClick={() => sendAction('submit_reply', { reply: myReply })}
                            disabled={!myReply.trim()}
                            className="w-full py-3 bg-[#FF5580] hover:bg-[#ff3c6c] disabled:bg-zinc-100 disabled:text-zinc-400 disabled:shadow-none disabled:translate-y-0 text-white font-display font-black text-xs uppercase tracking-wider rounded-xl shadow-[3px_3px_0px_0px_#000] border-2 border-zinc-950 hover:translate-x-px hover:translate-y-px hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            id="send-reply-action-btn"
                          >
                            <Send className="w-3.5 h-3.5" /> Synchronize Reply
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Turn Action Buttons (Only visible to the active answering player) */}
                  {isMyTurn ? (
                    <div className="grid grid-cols-2 gap-4 mt-4" id="turn-action-buttons">
                      <button
                        onClick={() => sendAction('complete_task', { status: 'completed' })}
                        className="py-3.5 bg-[#06D6A0] hover:bg-[#04c290] text-zinc-950 font-display font-black text-sm tracking-wider rounded-2xl border-[3px] border-zinc-950 shadow-[4px_4px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-1.5 uppercase"
                        id="action-complete-btn"
                      >
                        <CheckCircle className="w-5 h-5" /> COMPLETE (+1pt)
                      </button>
                      <button
                        onClick={() => sendAction('complete_task', { status: 'forfeited' })}
                        className="py-3.5 bg-white hover:bg-zinc-50 text-[#FF5580] border-[3px] border-zinc-950 font-display font-black text-sm tracking-wider rounded-2xl shadow-[4px_4px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-1.5 uppercase"
                        id="action-forfeit-btn"
                      >
                        <XCircle className="w-5 h-5" /> FORFEIT CHANCE
                      </button>
                    </div>
                  ) : (
                    /* Spectator & Passive players waiting block */
                    <div className="mt-4 p-4 bg-[#FFDE4D]/15 border-2 border-dashed border-[#FFDE4D] text-[#bc9606] font-bold rounded-2xl text-center" id="waiting-for-player-action-box">
                      <p className="text-[11px] uppercase font-mono font-black tracking-wider flex items-center justify-center gap-1.5">
                        ⏳ ACTIVE: WAITING FOR {activeTurnPlayer?.name?.toUpperCase()} TO DECLARE CHALLENGE OUTCOME!
                      </p>
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>

        {/* COLUMN 3: UTILITIES & RULES SETUP (3 cols) - Disappearing media, history log & collapsible rules setup */}
        <div className="lg:col-span-3 lg:order-3 order-3 space-y-6">
          
          {/* DISAPPEARING VIEW-ONCE MEDIA PANEL */}
          {!isSpectator && (
            <div className="bg-white border-[3px] border-zinc-950 rounded-3xl p-4 shadow-[5px_5px_0px_0px_#000] relative overflow-hidden" id="disappearing-media-card">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#FF5580]/5 rounded-full blur-xl"></div>
              
              <h3 className="font-display font-black text-sm uppercase tracking-tight text-zinc-950 mb-2 flex items-center gap-2">
                <Camera className="w-4.5 h-4.5 text-[#FF5580]" /> VIEW-ONCE PROOF
              </h3>
              
              <p className="text-[10px] text-zinc-600 font-bold leading-normal mb-3 font-sans">
                Snap or upload a photo, video, or voice note proof of your dare. It is instantly destroyed once they click reveal!
              </p>

              {/* INCOMING MEDIA INDICATOR */}
              {hasPendingMedia ? (
                <div className="mb-4 p-3.5 bg-[#FF5580]/10 border-2 border-[#FF5580] rounded-2xl flex flex-col gap-2.5 animate-pulse" id="incoming-media-box">
                  <div className="flex items-center gap-2 text-left">
                    <div className="w-8 h-8 rounded-xl bg-[#FF5580] border-2 border-zinc-950 text-white flex items-center justify-center shrink-0 shadow-[1px_1px_0px_0px_#000]">
                      {pendingMediaType === 'video' ? <FileVideo className="w-4 h-4" /> : pendingMediaType === 'audio' ? <Mic className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                    </div>
                    <div className="truncate flex-1">
                      <h4 className="text-[11px] font-black uppercase text-zinc-950 truncate leading-tight">Incoming Proof Waiting</h4>
                      <p className="text-[9px] text-zinc-500 font-bold uppercase truncate font-mono">From {pendingMediaSender}</p>
                    </div>
                  </div>
                  
                  <button
                    onClick={viewTransientMedia}
                    className="w-full py-2 bg-[#FF5580] hover:bg-[#ff3c6c] text-white border-2 border-zinc-950 font-display font-black text-[10.5px] uppercase tracking-wider rounded-xl shadow-[2px_2px_0px_0px_#000] hover:translate-y-px hover:shadow-none active:translate-y-px active:shadow-none transition cursor-pointer flex items-center justify-center gap-1.5"
                    id="reveal-media-btn"
                  >
                    <Eye className="w-3.5 h-3.5" /> REVEAL NOW
                  </button>
                </div>
              ) : null}

              {/* SEND MEDIA SECTION */}
              <div className="space-y-2">
                <label className="block">
                  <span className="sr-only">Choose Photo, Video or Voice Note</span>
                  <input
                    type="file"
                    accept="image/*,video/*,audio/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        sendTransientMedia(file);
                        e.target.value = '';
                      }
                    }}
                    className="block w-full text-[10px] text-zinc-500
                      file:mr-2.5 file:py-2 file:px-3
                      file:rounded-xl file:border-2 file:border-zinc-950
                      file:text-[9.5px] file:font-black file:uppercase
                      file:bg-zinc-100 file:text-zinc-950
                      hover:file:bg-zinc-200
                      file:cursor-pointer cursor-pointer"
                    id="media-file-input"
                  />
                </label>

                {/* STATUS MESSAGE FOR SENDING */}
                {mediaSendingStatus !== 'idle' && (
                  <div className={`p-2.5 rounded-2xl border-2 text-[10px] font-bold text-left flex items-center gap-1.5 ${
                    mediaSendingStatus === 'reading' || mediaSendingStatus === 'sending'
                      ? 'bg-zinc-50 border-zinc-300 text-zinc-500 animate-pulse'
                      : mediaSendingStatus === 'success'
                      ? 'bg-[#06D6A0]/10 border-[#06D6A0] text-[#04946e]'
                      : 'bg-[#FF5580]/10 border-[#FF5580] text-[#dd2855]'
                  }`} id="media-status-box">
                    <div className="flex flex-col gap-0.5 w-full">
                      <span className="font-black uppercase text-[8px] font-mono leading-none">
                        {mediaSendingStatus === 'reading' && 'Processing File...'}
                        {mediaSendingStatus === 'sending' && 'Uploading Data...'}
                        {mediaSendingStatus === 'success' && 'Transmitted!'}
                        {mediaSendingStatus === 'error' && 'Error Failed'}
                      </span>
                      <span className="truncate block mt-0.5">{mediaSendingMessage}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* HISTORIC GAME LOGS */}
          <div className="bg-white border-[3px] border-zinc-950 rounded-3xl p-4 shadow-[5px_5px_0px_0px_#000]" id="game-history-log">
            <h3 className="font-display font-black text-sm uppercase tracking-tight text-zinc-950 mb-2.5 flex items-center gap-2">
              <History className="w-4.5 h-4.5 text-[#06D6A0]" /> MATCH LOGS
            </h3>
            
            {gameState.completedTasks.length === 0 ? (
              <div className="text-center py-6 text-zinc-400 text-[10px] font-bold uppercase tracking-wider">
                No challenges played in this session.
              </div>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1.5 scrollbar-thin text-left">
                {gameState.completedTasks.map((task, idx) => (
                  <div 
                    key={idx} 
                    className={`p-2.5 rounded-2xl border-2 flex justify-between items-start gap-2 text-[10px] ${
                      task.status === 'completed' 
                        ? 'bg-[#06D6A0]/10 border-[#06D6A0]/30' 
                        : 'bg-[#FF5580]/10 border-[#FF5580]/30'
                    }`}
                  >
                    <div className="space-y-0.5 truncate flex-1">
                      <div className="flex items-center gap-1 flex-wrap">
                        <strong className="text-zinc-900 font-black uppercase tracking-tight truncate max-w-[65px]">{task.playerName}</strong>
                        <span className={`px-1 rounded text-[7.5px] font-black uppercase tracking-wider ${
                          task.type === 'truth' ? 'bg-[#FFDE4D] text-zinc-950' : 'bg-[#FF5580] text-white'
                        }`}>
                          {task.type}
                        </span>
                      </div>
                      <p className="text-zinc-700 italic truncate" title={task.text}>"{task.text}"</p>
                    </div>

                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase shrink-0 ${
                      task.status === 'completed' 
                        ? 'bg-[#06D6A0] text-zinc-950 border-2 border-zinc-950 shadow-[1px_1px_0px_0px_#000]' 
                        : 'bg-[#FF5580] text-white border-2 border-zinc-950 shadow-[1px_1px_0px_0px_#000]'
                    }`}>
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* COLLAPSIBLE SETUP & CONFIGURATION (Settings de-clutter) */}
          <div className="bg-white border-[3px] border-zinc-950 rounded-3xl overflow-hidden shadow-[5px_5px_0px_0px_#000]" id="settings-collapsible-card">
            <button
              onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
              className="w-full flex items-center justify-between p-4 bg-white hover:bg-zinc-50 transition-colors text-left cursor-pointer outline-none"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4.5 h-4.5 text-[#FF5580]" />
                <span className="font-display font-black text-xs uppercase tracking-wider text-zinc-950">HOST SETTINGS</span>
              </div>
              <div className={`transition-transform duration-200 transform ${isSettingsExpanded ? 'rotate-90' : 'rotate-0'}`}>
                <ChevronRight className="w-4 h-4 text-zinc-500" />
              </div>
            </button>
            
            {isSettingsExpanded && (
              <div className="p-4 border-t-2 border-zinc-200 space-y-4 bg-zinc-50/50">
                {/* Active Categories */}
                <div id="categories-config-card" className="text-left">
                  <h4 className="font-display font-black text-[10px] uppercase tracking-wider text-zinc-950 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF5580]" /> MATCH CATEGORIES
                  </h4>

                  <div className="space-y-1.5">
                    {(['general', 'fun', 'spicy'] as Category[]).map((cat) => {
                      const active = gameState.selectedCategories.includes(cat);
                      const isMyTurnOrAdmin = !isSpectator;
                      
                      return (
                        <button
                          key={cat}
                          disabled={!isMyTurnOrAdmin}
                          onClick={() => sendAction('toggle_category', { category: cat })}
                          className={`w-full flex items-center justify-between p-2 rounded-xl border-2 transition-all text-left ${
                            active 
                              ? 'bg-[#FFDE4D] border-zinc-950 text-zinc-950 shadow-[2px_2px_0px_0px_#000]' 
                              : 'bg-white border-zinc-200 text-zinc-500'
                          } ${isMyTurnOrAdmin ? 'hover:border-zinc-950 cursor-pointer' : 'opacity-80'}`}
                        >
                          <div className="flex items-center gap-2">
                            {cat === 'spicy' && <Flame className={`w-3.5 h-3.5 ${active ? 'text-[#FF5580]' : 'text-zinc-400'}`} />}
                            {cat === 'fun' && <Laugh className={`w-3.5 h-3.5 ${active ? 'text-zinc-950' : 'text-zinc-400'}`} />}
                            {cat === 'general' && <Sparkles className={`w-3.5 h-3.5 ${active ? 'text-zinc-950' : 'text-zinc-400'}`} />}
                            <span className="text-[10px] font-black uppercase italic tracking-wider">{cat}</span>
                          </div>

                          <div className={`w-3.5 h-3.5 rounded-lg flex items-center justify-center border-2 text-[8px] font-black ${
                            active 
                              ? 'bg-[#FF5580] border-zinc-950 text-white' 
                              : 'border-zinc-300'
                          }`}>
                            {active && '✓'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Active Timer Settings */}
                {!isSpectator && (
                  <div id="timer-config-card" className="text-left">
                    <h4 className="font-display font-black text-[10px] uppercase tracking-wider text-zinc-950 mb-2 flex items-center gap-1.5">
                      <Timer className="w-3.5 h-3.5 text-[#06D6A0]" /> TIMER LENGTH
                    </h4>
                    
                    <div className="flex gap-1 bg-white p-1 rounded-xl border-2 border-zinc-950 shadow-[2px_2px_0px_0px_#000]">
                      {[30, 45, 60, 90].map((dur) => (
                        <button
                          key={dur}
                          onClick={() => sendAction('set_timer_duration', { duration: dur })}
                          className={`flex-1 py-1 rounded-lg text-[10px] font-black uppercase transition-all cursor-pointer ${
                            gameState.timerDuration === dur
                              ? 'bg-[#06D6A0] text-zinc-950 border-2 border-zinc-950 shadow-[1px_1px_0px_0px_#000]'
                              : 'text-zinc-500 hover:text-zinc-950'
                          }`}
                        >
                          {dur}s
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reset / Restart Session */}
                {!isSpectator && (
                  <button
                    onClick={() => {
                      if (confirm("Reset scores and starting a new game?")) {
                        sendAction('restart_game');
                      }
                    }}
                    className="w-full py-2 bg-white hover:bg-zinc-50 text-[#FF5580] border-2 border-zinc-950 rounded-xl font-display font-black text-[10px] tracking-wider uppercase transition shadow-[2px_2px_0px_0px_#000] active:translate-y-px active:shadow-none flex items-center justify-center gap-1.5 cursor-pointer"
                    id="restart-game-btn"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> RESTART SCOREBOARD
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
      </main>

      {/* IMMERSIVE VIEW-ONCE DISAPPEARING MEDIA OVERLAY */}
      {viewingMedia && (
        <div className="fixed inset-0 bg-zinc-950/95 z-50 flex flex-col justify-between p-6 select-none overflow-y-auto" id="media-overlay-modal">
          {/* Header Warning */}
          <div className="w-full max-w-xl mx-auto flex justify-between items-center bg-white border-4 border-[#FF5580] p-4 rounded-3xl shadow-[5px_5px_0px_0px_#000]">
            <div className="flex items-center gap-2.5 text-left">
              <div className="w-3 h-3 rounded-full bg-[#FF5580] animate-ping"></div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-950">DISAPPEARING PROOF CONTENT</h3>
                <p className="text-[10px] text-zinc-600 font-bold">Sent by {viewingMedia.senderName} • Will dissolve permanently when closed</p>
              </div>
            </div>
            
            <div className="px-2.5 py-0.5 bg-[#FFDE4D] border-2 border-zinc-950 rounded text-[9px] font-black uppercase text-zinc-950 tracking-wider">
              VIEW-ONCE
            </div>
          </div>

          {/* Media Container */}
          <div className="w-full max-w-3xl mx-auto flex-1 my-6 flex items-center justify-center relative">
            {viewingMedia.mediaType === 'video' ? (
              <video 
                src={viewingMedia.dataUrl} 
                controls 
                autoPlay 
                playsInline
                disablePictureInPicture
                controlsList="nodownload noremoteplayback"
                className="max-h-[65vh] max-w-full rounded-2xl border-4 border-zinc-950 shadow-[8px_8px_0px_0px_#000] object-contain bg-black"
                onContextMenu={(e) => e.preventDefault()}
              />
            ) : viewingMedia.mediaType === 'audio' ? (
              <div className="bg-white border-4 border-zinc-950 p-8 rounded-3xl shadow-[6px_6px_0px_0px_#000] flex flex-col items-center text-center max-w-sm w-full">
                <div className="w-16 h-16 bg-[#FFDE4D] border-2 border-zinc-950 rounded-full flex items-center justify-center text-3xl mb-4 animate-bounce">
                  🎤
                </div>
                <h4 className="font-display font-black text-lg text-zinc-950 uppercase mb-1">Disappearing Voice Note</h4>
                <p className="text-zinc-600 text-xs font-bold mb-5 font-sans">Listen carefully! This audio note is view-once.</p>
                <audio 
                  src={viewingMedia.dataUrl} 
                  controls 
                  autoPlay 
                  className="w-full"
                />
              </div>
            ) : (
              <img 
                src={viewingMedia.dataUrl} 
                alt="Disappearing Proof"
                referrerPolicy="no-referrer"
                className="max-h-[65vh] max-w-full rounded-2xl border-4 border-zinc-950 shadow-[8px_8px_0px_0px_#000] object-contain bg-black select-none"
                onContextMenu={(e) => e.preventDefault()}
                draggable="false"
              />
            )}
          </div>

          {/* Action Footer */}
          <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-4 pb-4">
            <div className="text-center text-white">
              <p className="text-xs text-zinc-300 flex items-center justify-center gap-1.5 uppercase font-black tracking-widest font-mono">
                <Lock className="w-4.5 h-4.5 text-[#FF5580]" /> SECURED ZERO-LOG CHANNEL
              </p>
              <p className="text-[10px] text-zinc-500 mt-1">Proof has been purged from system memory. Closing this view shreds it forever.</p>
            </div>

            <button
              onClick={() => setViewingMedia(null)}
              className="w-full py-4 bg-[#FF5580] hover:bg-[#ff3c6c] text-white border-[3px] border-zinc-950 font-display font-black text-lg tracking-wider rounded-2xl shadow-[4px_4px_0px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-2 uppercase"
              id="close-destroy-media-btn"
            >
              <Trash2 className="w-5 h-5" /> CLOSE & OBLITERATE FOREVER
            </button>
          </div>
        </div>
      )}

      {/* Footer for Active Game */}
      <footer className="w-full text-center py-6 text-zinc-500 text-xs border-t-2 border-zinc-200 mt-12 font-mono flex flex-col sm:flex-row justify-between items-center max-w-7xl mx-auto gap-3">
        <p>© 2026 TRUTH OR DARE LIVE PARTY CONSOLE • REAL-TIME WEB SYNCED.</p>
        <button 
          onClick={() => setIsAdminOpen(true)}
          className="px-3 py-1 bg-zinc-950 text-[#06D6A0] border-2 border-zinc-950 hover:bg-zinc-900 rounded-lg text-[10px] font-black uppercase tracking-widest cursor-pointer shadow-[2px_2px_0px_0px_#000] hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all"
        >
          🕵️ Admin Console Decryption
        </button>
      </footer>

      {renderAdminModal()}
    </div>
  );
}
