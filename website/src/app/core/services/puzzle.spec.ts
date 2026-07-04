import { TestBed } from '@angular/core/testing';

import { Puzzle } from './puzzle';

describe('Puzzle', () => {
  let service: Puzzle;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Puzzle);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
