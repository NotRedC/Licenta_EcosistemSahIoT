export const ENVIRONMENT = {
    production: false,
    supabaseUrl: 'https://chtguxidyzcaqpxrhnkc.supabase.co',
    supabaseKey: 'sb_publishable_JSKyyZiSoUcBF5cYWWU5QA_1YsPit2I'
}

export interface GameRow{
    id: string;            
    board_id: string | null;
    white_player: string | null;
    black_player: string | null;
    current_fen: string;
    pgn: string;
    status: 'ongoing' | 'ended';
    result: 'white win' | 'black win' | 'draw' | null;
    created_at: Date;
    updated_at: Date;
}

export interface ChessPuzzle {
  id: string;
  fen: string;
  moves: string; 
  rating: number;
}

export type DifficultyTier = 'easy' | 'medium' | 'hard';

export const DIFFICULTY_BOUNDS = {
    easy: {min: 0, max: 1500},
    medium: {min: 1501, max: 2400},
    hard: {min: 2401, max: 3300}
} as const;