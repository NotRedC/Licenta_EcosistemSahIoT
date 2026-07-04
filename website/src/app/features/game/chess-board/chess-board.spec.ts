import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChessBoard } from './chess-board';

describe('ChessBoard', () => {
  let component: ChessBoard;
  let fixture: ComponentFixture<ChessBoard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChessBoard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChessBoard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
