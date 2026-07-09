import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { App } from './app';
import { TimelineApiService } from './services/timeline-api.service';
import { ThreeTunnelComponent } from './components/three-tunnel/three-tunnel.component';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: TimelineApiService,
          useValue: {
            getTimeline: () => of({ timelineSegments: [], segmentCards: [] }),
            getProjects: () => of({ projects: [] })
          }
        }
      ]
    })
      // The WebGL visualizer can't run in jsdom; render its tag as an unknown element.
      .overrideComponent(App, {
        remove: { imports: [ThreeTunnelComponent] },
        add: { schemas: [NO_ERRORS_SCHEMA] }
      })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the stage heading', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Exploring');
  });
});
