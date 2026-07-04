import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MoveHistory } from './move-history';

describe('MoveHistory', () => {
  let component: MoveHistory;
  let fixture: ComponentFixture<MoveHistory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MoveHistory]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MoveHistory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
