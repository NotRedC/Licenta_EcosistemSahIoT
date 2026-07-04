import { Routes } from '@angular/router';
import { Dashboard } from './features/dashboard/dashboard';
import { GameState } from './core/services/game-state';
import { GameEngine } from './core/services/game-engine';
import { Puzzle } from './core/services/puzzle';

export const routes: Routes = [
    {path: '', component: Dashboard},
    { 
    path: 'live-game/:selectedGameId', 
    loadComponent: () => import('./features/live-games/live-games/live-games').then(m => m.LiveGames), 
    providers: [GameState, GameEngine]
  },
    {
      path: 'lobby',
      loadComponent: () => import('./features/live-games/lobby/lobby/lobby').then(m => m.Lobby),
    },
  { path: 'puzzles',
    loadComponent: () => import('./features/puzzle/puzzle/puzzle').then(m => m.PuzzleComponent),
    providers: [Puzzle, GameEngine]
  },
  
  { path: '**', redirectTo: '' }
];
