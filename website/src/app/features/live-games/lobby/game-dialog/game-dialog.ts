import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatGridListModule } from '@angular/material/grid-list'
import { Database } from '../../../../core/database/database';
import { GameRow } from '../../../../core/database/environments';
import { Chess } from 'chess.js';

@Component({
  selector: 'app-game-dialog',
  imports: [MatDialogModule, MatGridListModule, MatButtonModule],
  templateUrl: './game-dialog.html',
  styleUrl: './game-dialog.scss',
})
export class GameDialog implements OnInit {
    private readonly db = inject(Database);

    private readonly _dialogInput =  inject<{ mode: 'live' | 'past' }>(MAT_DIALOG_DATA);
    readonly isImporting = signal<boolean>(false);

    readonly data = {
    mode: this._dialogInput.mode,
    games: signal<GameRow[]>([])
  };

    async ngOnInit(): Promise<void>{
      try {
        const fetchedGames = await this.db.getAllGames();
        if(this.data.mode === 'live'){
          this.data.games.set(fetchedGames.filter(g => g.status === 'ongoing'));
        } else{
          this.data.games.set(fetchedGames.filter(g => g.status === 'ended'));
        }
      } catch(error){
        console.error(error);
      }
    }
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();
    this.isImporting.set(true);

    reader.onload = async (e) => {
      const pgnContent = e.target?.result as string;
      if (pgnContent) {
        await this._processAndUploadPgn(pgnContent);
      }
      this.isImporting.set(false);
      input.value = ''; 
    };

    reader.onerror = () => {
      console.error('Failed to read targeted PGN system log file.');
      this.isImporting.set(false);
    };

    reader.readAsText(file);
  }

  private async _processAndUploadPgn(rawPgn: string): Promise<void> {
    try {
      const chess = new Chess();
      
      chess.loadPgn(rawPgn);
      const headers = chess.header();

      let mappedResult: 'white win' | 'black win' | 'draw' | null = null;
      if (headers['Result'] === '1-0') mappedResult = 'white win';
      if (headers['Result'] === '0-1') mappedResult = 'black win';
      if (headers['Result'] === '1/2-1/2') mappedResult = 'draw';

      const payload = {
        white_player: headers['White'] || 'UNKNOWN PLAYER',
        black_player: headers['Black'] || 'UNKNOWN PLAYER',
        pgn: rawPgn,
        current_fen: chess.fen(), 
        status: 'ended',
        result: mappedResult
      };
      console.log(payload);

      const savedRow = await this.db.importGame(payload);
      console.log(savedRow);
      this.data.games.update(current => [savedRow, ...current]);
      console.log('External log segment successfully ingested into Supabase sector.');

    } catch (err) {
      console.error('Invalid PGN payload structural architecture metadata:', err);
      alert('Failed to parse PGN file: Ensure file contains valid chess rules and metadata tokens.');
    }
  }
}
