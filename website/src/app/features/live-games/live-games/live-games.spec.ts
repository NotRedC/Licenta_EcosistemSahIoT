import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LiveGames } from './live-games';

describe('LiveGames', () => {
  let component: LiveGames;
  let fixture: ComponentFixture<LiveGames>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LiveGames]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LiveGames);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
