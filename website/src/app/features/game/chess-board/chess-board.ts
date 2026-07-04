import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Chess, Square} from 'chess.js';

export interface BoardPiece {
  id: string;
  x: number;
  y: number;
  square: Square;
  icon: string;
}

@Component({
  selector: 'app-chess-board',
  imports: [CommonModule],
  templateUrl: './chess-board.html',
  styleUrls: ['./chess-board.scss'],
  host: {
    'role': 'grid',
    'aria-label': 'Interactive Chess Board'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChessBoard {
  private static readonly pieceMap: Record<string, string> = {
    'wp': '♙', 'wr': '♖', 'wn': '♘', 'wb': '♗', 'wq': '♕', 'wk': '♔',
    'bp': '♟', 'br': '♜', 'bn': '♞', 'bb': '♝', 'bq': '♛', 'bk': '♚'
  };
  fen = input.required<string>();
  isAnalysisActive = input<boolean>(false);
  hintSquares = input<{ from: string | null; to: string | null }>({ from: null, to: null });

  moveMade = output<{ from: string; to: string }>();

  protected readonly selectedSquare = signal<string | null>(null);

  protected readonly validDestinations = computed(() => {
    const from = this.selectedSquare();
    if (!from) return [] as string[];
    const tempEngine = new Chess(this.fen());
    return tempEngine.moves({ square: from as any, verbose: true }).map(m => m.to);
  });

  handleSquareClick(square: string): void {
    const current = this.selectedSquare();
    
    if(current === square){
      this.selectedSquare.set(null);
    }
    if (current && this.validDestinations().includes(square)) {

      this.moveMade.emit({ from: current, to: square });
      this.selectedSquare.set(null);
      return;
    }

    this.selectedSquare.set(current === square ? null : square);
  }

  protected readonly piecesOnBoard = computed<BoardPiece[]>(() => {
    const temp = new Chess(this.fen());
    const layout = temp.board();
    const pieces: BoardPiece[] = [];
    layout.forEach((row, y) => {
      row.forEach((square, x) => {
        if (square) {
          pieces.push({
            id: `${square.type}-${square.color}-${x}-${y}`,
            x,y,
            square: square.square,
            icon: ChessBoard.pieceMap[`${square.color}${square.type}`]
          });
        }
      });
    });
    return pieces;
  });
}

