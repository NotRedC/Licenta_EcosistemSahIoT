import { Component, input } from '@angular/core';

@Component({
  selector: 'app-clock',
  imports: [],
  templateUrl: './clock.html',
  styleUrl: './clock.scss',
})
export class Clock{
  readonly whiteTime = input.required<string>();
  readonly blackTime = input.required<string>();
  readonly activeColor = input.required<string>();
}
