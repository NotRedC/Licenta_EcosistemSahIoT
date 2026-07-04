import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GameEngine } from '../../../core/services/game-engine';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-eval-bar',
  imports: [CommonModule],
  templateUrl: './eval-bar.html',
  styleUrls: ['./eval-bar.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EvalBar {
  score = input<string>("0");
  whitePercentage = input<number>(50);
  isThinking = input<boolean>(false);
}