export type Category = 'general' | 'spicy' | 'fun';
export type QuestionType = 'truth' | 'dare';

export interface Question {
  id: string;
  text: string;
  category: Category;
  type: QuestionType;
}

export interface Player {
  id: string;
  name: string;
  slot: 'player1' | 'player2' | 'spectator';
  active: boolean;
  lastActive: number;
  ip?: string;
}

export interface GameState {
  roomId: string;
  players: {
    player1?: Player;
    player2?: Player;
    spectators: Player[];
  };
  turn: 'player1' | 'player2';
  currentSelection: QuestionType | null;
  currentQuestion: Question | null;
  selectedCategories: Category[];
  timerDuration: number; // Configured timer length (e.g., 30, 45, 60 seconds)
  timerLeft: number;
  timerActive: boolean;
  timerStartedAt: number | null; // Timestamp when active timer was last started
  gameStarted: boolean;
  roundCount: number;
  completedTasks: {
    id: string;
    playerSlot: 'player1' | 'player2';
    playerName: string;
    type: QuestionType;
    category: Category;
    text: string;
    status: 'completed' | 'forfeited';
    timestamp: number;
    reply?: string;
  }[];
  scores: {
    player1: number;
    player2: number;
  };
  currentReply?: string;
  chatMessages?: {
    id: string;
    senderName: string;
    senderSlot: 'player1' | 'player2' | 'spectator';
    text: string;
    timestamp: number;
  }[];
  lastActionMessage: string;
  lastUpdated: number;
}
