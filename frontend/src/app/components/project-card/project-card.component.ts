import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Project } from '../../models/timeline';

@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="project-card"
      [class.project-card-selected]="selected"
      (click)="select.emit(project)">
      <div class="card-header">
        <span class="card-title">{{ project.title }}</span>
        <span class="card-dates">
          {{ project.startDate | date:'yyyy' }}
          @if (project.endDate) { – {{ project.endDate | date:'yyyy' }} }
          @else { – present }
        </span>
      </div>
      <p class="card-description">{{ project.shortDescription }}</p>
      <ul class="card-tags" aria-label="Technologies">
        @for (tech of project.technologies.slice(0, 4); track tech) {
          <li>{{ tech }}</li>
        }
        @if (project.technologies.length > 4) {
          <li class="card-tag-more">+{{ project.technologies.length - 4 }}</li>
        }
      </ul>
    </button>
  `,
  styleUrl: './project-card.component.scss'
})
export class ProjectCardComponent {
  @Input({ required: true }) project!: Project;
  @Input() selected = false;
  @Output() select = new EventEmitter<Project>();
}
