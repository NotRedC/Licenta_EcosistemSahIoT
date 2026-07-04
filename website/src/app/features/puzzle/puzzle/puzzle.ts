import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { GameState } from '../../../core/services/game-state';
import { Puzzle } from '../../../core/services/puzzle';
import { GameEngine } from '../../../core/services/game-engine';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ChessBoard } from '../../game/chess-board/chess-board';
import { EvalBar } from '../../game/eval-bar/eval-bar';
import { MoveHistory } from '../../game/move-history/move-history';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-puzzle',
  imports: [CommonModule, EvalBar, ChessBoard, MoveHistory, RouterLink, MatToolbarModule, MatIconModule, MatButtonModule, MatCardModule],
  templateUrl: './puzzle.html',
  styleUrl: './puzzle.scss',
  providers: [Puzzle, GameState, GameEngine]
})
export class PuzzleComponent {
  protected readonly puzzle = inject(Puzzle);
  protected readonly gameState = inject(GameState);
  protected readonly engine = inject(GameEngine);
  private readonly router = inject(Router);

  protected readonly showDifficultyModal = signal<boolean>(true);
  protected readonly showCompletionModal = computed(() => {
    return this.puzzle.puzzleStatus() === 'completed' && !this.puzzle.isAnalysisEnabled();
  });

  readonly whitePercentage = computed(() => {
    const evalScore = this.engine.eval();
    const percentage = 50 + (Number(evalScore) * 10);
  if (typeof evalScore === 'string' && /M/.test(evalScore)) {
    const evalString = evalScore as string;
    return evalString.startsWith('-') ? 0 : 100;
  }
    return Math.min(Math.max(percentage, 5), 95);
  });

  protected readonly currentScoreString = computed(() => {
    return this.engine.eval();
  });

  constructor() {
    effect(() => {
      const currentFen = this.gameState.displayFen();
      untracked(() => {
        if (!this.puzzle.isAnalysisEnabled()) {
          this.engine.topLines.set([]);
          return;
        }
        this.engine.analyze(currentFen);
      });
    });
  }

  selectDifficulty(level: 'easy' | 'medium' | 'hard'): void {
    this.showDifficultyModal.set(false);
    this.puzzle.loadPuzzle(level);
  }

  handleBoardMove(moveCoords: { from: string; to: string }): void {
    console.log('Player move attempted:', moveCoords);
    this.puzzle.submitPlayerMove({
      from: moveCoords.from,
      to: moveCoords.to
    });
  }

  triggerNextPuzzle(): void {
    this.puzzle.puzzleStatus.set('thinking')
    this.showDifficultyModal.set(true);
  }

  triggerBackToMenu(): void {
    this.puzzle.exitPuzzleMode();
    this.router.navigate(['/']);
  }
}
