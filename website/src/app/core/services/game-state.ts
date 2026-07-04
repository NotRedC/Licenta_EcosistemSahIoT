import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { Chess, Move, Square }  from 'chess.js';


@Injectable()
export class GameState implements OnDestroy {
  private readonly _liveChess = new Chess();
  private readonly _analysisChess = new Chess();

  readonly liveFen = signal<string>(this._liveChess.fen());
  readonly analysisFen = signal<string | null>(null);

  private readonly _stateTrigger = signal<number>(0);

  readonly isAnalysisActive = computed(() => this.analysisFen() !== null);

  public loadGame(pgn: string): void {
    this._liveChess.loadPgn(pgn);
    this.liveFen.set(this._liveChess.fen());
    this._notifyStateChange();
    //console.log("Live Chess turn: ", this._liveChess.turn()); 
  }

  readonly displayFen = computed(() => {
      if(this.isAnalysisActive()) return this.analysisFen() ?? this.liveFen();
      return this.liveFen();
    });

  private get _activeEngine(): Chess {
    if(this.isAnalysisActive()) return this._analysisChess;
    return this._liveChess;
  }

  readonly turn = computed(() => {
    this._stateTrigger();
    return this._activeEngine.turn() === 'w' ? 'White' : 'Black';
  });

  readonly liveTurn = computed(() => {
    this._stateTrigger();
    return this._liveChess.turn() === 'w' ? 'White' : 'Black';
  })

  readonly isCheckmate = computed(() => {
    this._stateTrigger(); 
    return this._activeEngine.isCheckmate();
  });
  readonly isGameOver = computed(() => {
    this._stateTrigger(); 
    return this._activeEngine.isGameOver();
  });

  readonly isLiveGameOver = computed(() => {
    this._stateTrigger();
    return this._liveChess.isGameOver();
  });

  readonly isStalemate = computed(() => {
    this._stateTrigger();
    return this._activeEngine.isStalemate();
  });

  readonly isThreefoldRepetition = computed(() => {
    this._stateTrigger();
    return this._activeEngine.isThreefoldRepetition();
  });

  readonly isInsufficientMaterial = computed(() => {
    this._stateTrigger();
    return this._activeEngine.isInsufficientMaterial();
  });

  readonly isDraw = computed(() => {
    this._stateTrigger();
    return this._activeEngine.isDraw();
  });

  readonly gameOverReason = computed<'checkmate' | 'stalemate' | 'threefold' | 'material' | 'fifty_moves' | null>(() => {
    if (!this.isGameOver()) return null;
    
    if (this.isCheckmate()) return 'checkmate';
    if (this.isStalemate()) return 'stalemate';
    if (this.isThreefoldRepetition()) return 'threefold';
    if (this.isInsufficientMaterial()) return 'material';
    if (this.isDraw()) return 'fifty_moves';
    
    return null;
  });
  readonly moveHistory = computed(() => {
    this._stateTrigger();
    return this._activeEngine.history({ verbose: true }) as Move[];
  });

  startAnalysisChess(branchIndex: number, pgn?: string): void {
    if (pgn) {
      this._analysisChess.loadPgn(pgn);
    } else {
      this._analysisChess.loadPgn(this._activeEngine.pgn());
    }
    console.log("Loaded PGN into analysis chess:", this._analysisChess.pgn());
    const movesToUndo = this._activeEngine.history().length - 1 - branchIndex;
    for (let i = 0; i < movesToUndo; i++) {
      this._analysisChess.undo();
    }

    this.analysisFen.set(this._analysisChess.fen());
    console.log("Analysis chess FEN after setup:", this.analysisFen());
    this._notifyStateChange();
  }

  playAnalysisChessMove(move: string | { from: string, to: string, promotion?: string }) {
    if (!this.isAnalysisActive()) {
      this.startAnalysisChess(this._activeEngine.history().length - 1);
    }
    console.log("Playing analysis move:", move);
    try {
      let parsedMove = move;
      if (typeof move === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) {
        parsedMove = {
          from: move.substring(0, 2),
          to: move.substring(2, 4),
          promotion: move[4] || 'q'
        };
      }
      console.log("Playing analysis move:", parsedMove);
      this._analysisChess.move(parsedMove);
      this.analysisFen.set(this._analysisChess.fen());
      this._notifyStateChange();
    } catch (e) {
      console.error(e);
      console.error("Invalid analysis move:", move);
    }
  }

  exitAnalysisChess() {
    console.log("Exiting analysis chess mode");
    this.analysisFen.set(null);
    this._notifyStateChange();
  }

  makeMove(from: string, to: string): boolean {
      this.playAnalysisChessMove({ from, to, promotion: 'q' });
      return true;
}

  reset(): void {
    this._liveChess.reset();
    this._analysisChess.reset();
    this.liveFen.set(this._liveChess.fen());
    this.analysisFen.set(null);
    this._notifyStateChange();
  }

  private _notifyStateChange(): void {
    this._stateTrigger.update(value => value + 1);
  }

  ngOnDestroy(): void {
    this.reset();
  }
}
