import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { App } from './app';
import { TimelineApiService } from './services/timeline-api.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: TimelineApiService,
          useValue: {
            getTimeline: () => of({ timelineSegments: [] })
          }
        }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render phase title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Phase 1 Foundation');
  });
});
