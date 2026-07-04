import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GameDialog } from './game-dialog';

describe('GameDialog', () => {
  let component: GameDialog;
  let fixture: ComponentFixture<GameDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GameDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GameDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
