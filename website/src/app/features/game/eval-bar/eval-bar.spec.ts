import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvalBar } from './eval-bar';

describe('EvalBar', () => {
  let component: EvalBar;
  let fixture: ComponentFixture<EvalBar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvalBar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvalBar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
