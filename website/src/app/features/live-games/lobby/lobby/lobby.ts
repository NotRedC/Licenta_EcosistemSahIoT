import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatRipple } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, Router } from '@angular/router';
import { MatDialogModule, MatDialog } from '@angular/material/dialog'
import { GameDialog } from '../game-dialog/game-dialog';

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [RouterLink, MatCardModule, MatIconModule, MatButtonModule, MatRipple, MatToolbarModule, MatDialogModule],
  templateUrl: './lobby.html',
  styleUrl: './lobby.scss',
})
export class Lobby {

  private dialog = inject(MatDialog);
  private router = inject(Router);

  openGamesDialog(profileType: 'live' | 'past'): void {

    const dialogRef = this.dialog.open(GameDialog, {
      width: '70vw',
      maxHeight: '70vw',
      maxWidth: '90vw',
      autoFocus: false,
      data: {
        mode: profileType,
      }
    });

    dialogRef.afterClosed().subscribe(selectedGameId => {
      if (selectedGameId) {
        console.log(`Initializing system navigation sequence for Matrix Frame: ${selectedGameId}`);
        this.router.navigate(['/live-game', selectedGameId]);
      }
    });
  }
}
