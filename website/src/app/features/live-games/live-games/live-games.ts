import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { GameState } from '../../../core/services/game-state';
import { RouterLink } from '@angular/router';
import { ChessBoard } from '../../game/chess-board/chess-board';
import { EvalBar } from '../../game/eval-bar/eval-bar';
import { MoveHistory } from '../../game/move-history/move-history';
import { GameEngine } from '../../../core/services/game-engine';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { Database } from '../../../core/database/database';
import { Clock } from '../../game/clock/clock';
import { GameRow } from '../../../core/database/environments';

@Component({
  selector: 'app-live-games',
  imports: [RouterLink, ChessBoard, EvalBar, MoveHistory, MatCardModule, MatIconModule, MatToolbarModule, MatButtonModule, Clock],
  templateUrl: './live-games.html',
  styleUrl: './live-games.scss',
  providers: [GameState, GameEngine]
})
export class LiveGames {
  protected readonly gameState = inject(GameState);
  protected readonly engine = inject(GameEngine);
  private readonly supabase = inject(Database);
  protected readonly isMate = computed(() => this.gameState.isCheckmate());
  protected readonly isDraw = computed(() => this.gameState.isGameOver() && !this.gameState.isCheckmate());

  readonly selectedGameId = input<string>();
  protected readonly isReady = signal<boolean>(false);
  protected readonly gameStatus = signal<string>('ongoing');
  protected readonly initialStatus = signal<string>('ongoing');
  protected readonly gameTurn = signal<string>('White');

  private readonly cardVisible = signal(false);

  protected readonly gameResultMessage = computed(() => {
    const reason = this.gameState.gameOverReason();
    if (!reason) return '';

    switch (reason) {
      case 'checkmate': {
        const winner = this.gameTurn() === 'White' ? 'Black' : 'White';
        return `${winner} wins by Checkmate!`;
      }
      case 'stalemate':
        return 'Match drawn: Stalemate (No legal moves left).';
      case 'threefold':
        return 'Match drawn: Threefold repetition claimed.';
      case 'material':
        return 'Match drawn: Insufficient material.';
      case 'fifty_moves':
        return 'Match drawn: 50-move rule limit reached without pawn moves or captures.';
      default:
        return 'Match drawn.';
    }
  });

  protected readonly showGameOverCard = computed(() => {
    return this.cardVisible();
  });

  protected closeGameOverCard():void{
    this.cardVisible.set(false);
  }

  readonly whitePercentage = computed(() => {
    const evalScore = this.engine.eval();
    const percentage = 50 + (Number(evalScore) * 10);
    console.log("Eval Score: ", evalScore);
    console.log("Percentage: ", percentage);
    if (/M/.test(evalScore)) {
      const evalString = evalScore as string;
      console.log("Eval String: ", evalString);
      return evalString.startsWith('-') ? 0 : 100;
    }
    if(this.isMate()){
      return this.gameState.turn() === 'White' ? 0 : 100;
    }
    return Math.min(Math.max(percentage, 5), 95);
  });

  protected readonly currentScoreString = computed(() => {
    if(this.isMate()){
      return this.gameState.turn() === 'White' ? "1-0" : "0-1";
    }
    return this.engine.eval();
  });

  private syncComponentState(game: GameRow) {
    console.log("synced")
    //console.log("Game: ", game);
    this.gameState.loadGame(game.pgn);
   //console.log("Game Turn Gamestate: ", this.gameState.turn());
    this.gameStatus.set(game.status);
    this.gameTurn.set(this.gameState.liveTurn());
    console.log("Game turn: ", this.gameTurn());
  }

  private async loadGame(id: string) {
    try {
      const game = await this.supabase.getGameById(id);
      console.log(game);
      this.gameState.loadGame(game.pgn);
      this.isReady.set(true);
      this.gameStatus.set(game.status);
      this.initialStatus.set(game.status);
      this.gameTurn.set(this.gameState.liveTurn());
      console.log("Game turn: ", this.gameTurn());
    } catch (err) {
      console.error('Failed to stream historical match data:', err);
    }
  }

  constructor() {
    effect(() =>{
      console.log("Loading...");
      const id = this.selectedGameId?.();
      console.log(id);
      if (id){ 
        this.isReady.set(false);
        this.loadGame(id);
      }
    })
    effect(() => {
      const currentFen = this.gameState.displayFen();
      if (!this.isReady()) return;
      untracked(() => {
        this.engine.analyze(currentFen);
      });
    });
    effect(() =>{
      if(this.gameStatus() == "ended" && this.initialStatus() == "ongoing"){
        this.cardVisible.set(true);
      }
    });
    effect((onCleanup) => {
      const id = this.selectedGameId();
      const ready = this.isReady();

      if (id && ready) {
        console.log(`Subscribed to Realtime pipeline for game session: ${id}`);
        
        const channel = this.supabase.subscribeToGame(id, (updatedGame: GameRow) => {
          console.log('Realtime move transmission detected. Syncing matrices...');
          this.syncComponentState(updatedGame);
        });

        onCleanup(() => {
          console.log(`Tearing down WebSocket room for game session: ${id}`);
          channel.unsubscribe();
        });
      }
    });
  }

}
