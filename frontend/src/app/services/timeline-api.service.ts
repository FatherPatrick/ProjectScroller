import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import type { TimelineResponse, ProjectsResponse, ProjectResponse } from '../models/timeline';

@Injectable({ providedIn: 'root' })
export class TimelineApiService {
  private readonly http = inject(HttpClient);

  getTimeline(): Observable<TimelineResponse> {
    return this.http.get<TimelineResponse>('/api/timeline');
  }

  getProjects(): Observable<ProjectsResponse> {
    return this.http.get<ProjectsResponse>('/api/projects');
  }

  getProject(slug: string): Observable<ProjectResponse> {
    return this.http.get<ProjectResponse>(`/api/projects/${slug}`);
  }
}
