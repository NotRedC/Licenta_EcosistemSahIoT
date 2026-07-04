import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ENVIRONMENT, GameRow, ChessPuzzle, DifficultyTier, DIFFICULTY_BOUNDS } from './environments';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({
  providedIn: 'root'
})
export class Database {
  private readonly _supabase: SupabaseClient;

  constructor(){
    this._supabase = createClient(ENVIRONMENT.supabaseUrl, ENVIRONMENT.supabaseKey);
  }

  async getAllGames() {
    const { data, error } = await this._supabase
      .from('games')
      .select('*')
      .order('id', { ascending: false });

    if (error) throw error;
    return data;
  }

  async getGameById(id: string): Promise<GameRow> {
    const { data, error } = await this._supabase
      .from('games')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as GameRow;
  }

  async importGame(payload: any){
    const {data, error} = await this._supabase
      .from('games')
      .insert([payload])
      .select()
      .single()

      if (error) throw error;
    return data;
  }

  async getPuzzlesByDifficulty(
    difficulty: DifficultyTier,
    page: number = 0,
    pageSize: number = 20
  ): Promise<ChessPuzzle[]>{
    const bounds = DIFFICULTY_BOUNDS[difficulty];
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await this._supabase
      .from('puzzles')
      .select('*')
      .gte('rating', bounds.min)
      .lte('rating', bounds.max)
      .range(from, to);

    if (error) throw error;
    return data as ChessPuzzle[];
  }

  subscribeToGame(id: string, onUpdate: (updatedGame: GameRow) => void): RealtimeChannel {
    return this._supabase
      .channel(`live_game/${id}`)
      .on<GameRow>(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${id}`
        },
        (payload) => {
          onUpdate(payload.new);
        }
      )
      .subscribe();
  }
}
