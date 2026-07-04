import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Puzzle } from './puzzle';

describe('Puzzle', () => {
  let component: Puzzle;
  let fixture: ComponentFixture<Puzzle>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Puzzle]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Puzzle);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
