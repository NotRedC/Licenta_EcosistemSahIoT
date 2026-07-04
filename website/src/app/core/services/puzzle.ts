import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { GameState } from './game-state';
import { Chess, Move } from 'chess.js';
import { Subscription, takeWhile, timer } from 'rxjs';
import { ChessPuzzle } from '../database/environments';
import { Database } from '../database/database';


@Injectable()
export class Puzzle implements OnDestroy {
  private readonly gameState = inject(GameState);
  private readonly db = inject(Database);
  private playbackSubscription?: Subscription;

  private puzzleCache: ChessPuzzle[] = [];
  private currentPage = 0;
  private currentDifficulty: 'easy' | 'medium' | 'hard' | null = null;

  readonly activePuzzle = signal<ChessPuzzle | null>(null);
  readonly currentMovePointer = signal<number>(0);
  readonly puzzleStatus = signal<'thinking' | 'correct' | 'failed' | 'completed'>('thinking');
  readonly hintLevel = signal<number>(0); // 0 = none, 1 = piece, 2 = full move
  readonly isAnalysisEnabled = signal<boolean>(false);

  private _puzzleChess = new Chess();

  public get puzzleFen(): string {
    if(this.isAnalysisEnabled()) return this.gameState.analysisFen() ?? this._puzzleChess.fen();
    return this._puzzleChess.fen();
  }

  public get puzzleHistory(): Move[] {
    if(this.isAnalysisEnabled()) return this.gameState.moveHistory() as Move[];
    return this._puzzleChess.history({ verbose: true });
  }

  readonly hintSquares = computed(() => {
    if(!this.activePuzzle()) return { from: null, to: null };
    const level = this.hintLevel();
    const puzzle = this.activePuzzle();
    const pointer = this.currentMovePointer();
    
    if (level === 0 || !puzzle) return { from: null, to: null };

    const targetMove = puzzle.moves[pointer];
    if (!targetMove) return { from: null, to: null };

    return {
      from: targetMove.substring(0, 2),
      to: level === 2 ? targetMove.substring(2, 4) : null
    };
  });

  requestHint(): void {
    if (this.puzzleStatus() === 'completed') return;
    this.hintLevel.update(current => current < 2 ? current + 1 : 2);
  }
  
  showMoves(): void {
    const puzzle = this.activePuzzle();
    if (!puzzle || this.puzzleStatus() === 'completed') return;

    this.playbackSubscription?.unsubscribe();

    this.playbackSubscription = timer(0, 1000).pipe(
      takeWhile(() => this.currentMovePointer() < puzzle.moves.length)
    )
    .subscribe({
      next: () => {
        const nextUci = puzzle.moves[this.currentMovePointer()];
        this.executePuzzleMove(nextUci);
        this.currentMovePointer.update(p => p + 1);
    },
      complete: () => {
        this.hintLevel.set(0);
        this.puzzleStatus.set('completed');
      }
    });
  }

  async loadPuzzle(difficulty: 'easy' | 'medium' | 'hard'): Promise<void> {
    this.playbackSubscription?.unsubscribe();
    if (this.currentDifficulty !== difficulty) {
      this.currentDifficulty = difficulty;
      this.puzzleCache = [];
      this.currentPage = 0;
    }
    if (this.puzzleCache.length === 0) {
      try {
        const rawData = await this.db.getPuzzlesByDifficulty(difficulty, this.currentPage, 20);
        console.log(rawData)
        this.puzzleCache = rawData.map(p =>({
          id: p.id,
          fen: p.fen,
          moves: p.moves,
          rating: p.rating
        }));
        this.currentPage++;
      }catch(error){
        console.error('Failed to fill local puzzle cache from database stream:', error);
        return;
      }
    }
    const selected = this.puzzleCache[Math.floor(Math.random() * this.puzzleCache.length)];
    console.log("Selected puzzle:", selected, selected.fen, selected.moves, selected.rating);
    this.hintLevel.set(0);
    this.isAnalysisEnabled.set(false);
    this.activePuzzle.set(selected);
    this.currentMovePointer.set(0);
    this.puzzleStatus.set('thinking');
    this._puzzleChess.load(selected.fen);
    console.log('Loaded puzzle with FEN:', selected.fen);
    this.executePuzzleMove(selected.moves.split(" ")[0]);
    this.currentMovePointer.set(1);
  }

  submitPlayerMove(move: { from: string, to: string, promotion?: string }): void {
    const puzzle = this.activePuzzle();
    if (!puzzle || this.puzzleStatus() === 'completed') return;

    this.playbackSubscription?.unsubscribe();

    const pointer = this.currentMovePointer();
    const targetMoves = puzzle.moves.split(" ");
    const targetUciMove = targetMoves[pointer];
    console.log("Make move: ", targetUciMove);

    const attemptedUci = `${move.from}${move.to}${move.promotion || ''}`;
    console.log('Attempting UCI move:', attemptedUci);

    if (attemptedUci === targetUciMove) {
      this.executePuzzleMove(targetUciMove);
      this.hintLevel.set(0);
      
      if (pointer + 1 >= targetMoves.length) {
        this.puzzleStatus.set('completed');
      } else {
        this.puzzleStatus.set('correct');
        this.currentMovePointer.set(pointer + 1);

        this.playbackSubscription = timer(800).subscribe(() => {
          this.executePuzzleMove(targetMoves[pointer + 1]);
          this.currentMovePointer.set(pointer + 2);
          this.puzzleStatus.set('thinking');
        });
      }
    } else {
      this.puzzleStatus.set('failed');
      this.playbackSubscription = timer(1000).subscribe(() => {
          this.puzzleStatus.set('thinking');
        });
    }
  }

  private executePuzzleMove(uciMove: string) {
    const moveObj = {
      from: uciMove.substring(0, 2),
      to: uciMove.substring(2, 4),
      promotion: uciMove[4] || undefined
    };

    this._puzzleChess.move(moveObj);
  }

  enablePostAnalysis() {
    this.isAnalysisEnabled.set(true);
    console.log('PGN:', this._puzzleChess.pgn());
    this.gameState.startAnalysisChess(this._puzzleChess.history().length, this._puzzleChess.pgn());
  }

  exitPuzzleMode() {
    this.playbackSubscription?.unsubscribe();
    this.activePuzzle.set(null);
    this.hintLevel.set(0);
    this.isAnalysisEnabled.set(false);
    this.currentMovePointer.set(0);
    this.puzzleCache = [];
  }

  ngOnDestroy(): void {
    this.playbackSubscription?.unsubscribe();
    this.exitPuzzleMode();
  }
}
