import { Component, computed, effect, inject, untracked } from '@angular/core';
import { GameState } from '../../core/services/game-state';
import { GameEngine } from '../../core/services/game-engine';
import { RouterLink } from '@angular/router';
import { MoveHistory } from '../game/move-history/move-history';
import { EvalBar } from '../game/eval-bar/eval-bar';
import { ChessBoard } from '../game/chess-board/chess-board';
import { MatToolbar, MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-practice',
  imports: [RouterLink, ChessBoard, EvalBar, MoveHistory, MatToolbarModule, MatIconModule, MatButtonModule, MatCardModule],
  templateUrl: './practice.html',
  styleUrl: './practice.scss',
  providers: [GameState, GameEngine]
})
export class Practice {
  protected readonly gameState = inject(GameState);
  protected readonly engine = inject(GameEngine);

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
        this.engine.analyze(currentFen);
      });
    });
  }

}
