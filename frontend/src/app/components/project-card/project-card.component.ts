import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
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

    @if (project.submilestones && project.submilestones.length > 0) {
      <div class="submilestones-container">
        <button
          type="button"
          class="submilestones-toggle"
          (click)="toggleSubmilestones($event)"
          aria-expanded="{{isExpanded()}}"
          [attr.aria-label]="'Toggle sub-milestones for ' + project.title">
          <span class="toggle-icon">{{ isExpanded() ? '−' : '+' }}</span>
          <span class="toggle-text">{{ project.submilestones.length }} milestones</span>
        </button>

        @if (isExpanded()) {
          <ul class="submilestones-list">
            @for (submilestone of project.submilestones; track submilestone.id) {
              <li class="submilestone-item">
                <div class="submilestone-date">{{ submilestone.date | date:'MMM dd' }}</div>
                <div class="submilestone-content">
                  <div class="submilestone-title">{{ submilestone.title }}</div>
                  <div class="submilestone-description">{{ submilestone.description }}</div>
                </div>
              </li>
            }
          </ul>
        }
      </div>
    }
  `,
  styleUrl: './project-card.component.scss'
})
export class ProjectCardComponent {
  @Input({ required: true }) project!: Project;
  @Input() selected = false;
  @Output() select = new EventEmitter<Project>();

  readonly isExpanded = signal(false);

  toggleSubmilestones(event: Event) {
    event.stopPropagation();
    this.isExpanded.update(v => !v);
  }
}
