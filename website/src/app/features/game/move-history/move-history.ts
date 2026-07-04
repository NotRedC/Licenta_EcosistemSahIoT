import { CommonModule } from '@angular/common';
import { Component, ChangeDetectionStrategy, inject, computed, input, output } from '@angular/core';
import { MatRippleModule } from '@angular/material/core';
import { Chess } from 'chess.js';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-move-history',
  imports: [CommonModule, MatButtonModule, MatRippleModule],
  templateUrl: './move-history.html',
  styleUrl: './move-history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MoveHistory {
  PIECE_ICONS = {
    w: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
    b: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' }
  } as const;
  displayHistory = input<any[]>([]);
  topLines = input<any[]>([]);
  isAnalyzing = input<boolean>(false);
  showEngineLines = input<boolean>(true);
  fen = input<string>('');
  isAnalysisActive = input<boolean>(false);

  historyMoveClicked = output<number>();
  engineLineClicked = output<string>();
  exitAnalysisChess = output<void>();

  protected readonly activeMoveIndex = computed(() => {
    const history = this.displayHistory();
    return history.length > 0 ? history.length - 1 : -1;
  });

  protected readonly movePairs = computed(() => {
    const history = this.displayHistory(); 
    //console.log('Raw move history for pairing:', history);
    const pairs: { number: number; white: string; black?: string }[] = [];
    for (let i = 0; i < history.length; i += 2) {
      pairs.push({
        number: Math.floor(i / 2) + 1,
        white: history[i].san,
        black: history[i + 1]?.san
      });
    }
    //console.log('Computed move pairs:', pairs);
    return pairs;
  });

  formatSequence(uciSequence: string[]): string {
    const tempChess = new Chess(this.fen()); 
    const sanMoves: string[] = [];

    for (const uci of uciSequence) {
      try {
        const moveObj = { from: uci.substring(0, 2), to: uci.substring(2, 4), promotion: uci[4] };
         const move = tempChess.move(moveObj);
        const side = move.color === 'w' ? 'w' : 'b';
        const piece = move.piece.toUpperCase() as keyof typeof this.PIECE_ICONS.w;
        const icon = this.PIECE_ICONS[side][piece];
        const text = move.san.replace(/^[KQRBN]/, '');
        sanMoves.push(icon + text);
      } catch { break; }
    }
    return sanMoves.join(' → ');
  }
}
