import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Project } from '../../models/timeline';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="project-detail" role="complementary" aria-label="Project detail">
      <header class="detail-header">
        <div class="detail-title-row">
          <h2 class="detail-title">{{ project.title }}</h2>
          <button type="button" class="detail-close" (click)="close.emit()" aria-label="Close detail">✕</button>
        </div>
        <div class="detail-meta">
          <span class="detail-dates">
            {{ project.startDate | date:'MMM yyyy' }}
            @if (project.endDate) { – {{ project.endDate | date:'MMM yyyy' }} }
            @else { – Present }
          </span>
          <div class="detail-tags">
            @for (tag of project.tags; track tag) {
              <span class="detail-tag">{{ tag }}</span>
            }
          </div>
        </div>
      </header>

      <div class="detail-body">
        <p class="detail-long-desc">{{ project.longDescription }}</p>

        @if (project.media && project.media.length > 0) {
          <section class="detail-section">
            <h3 class="detail-section-label">Images</h3>
            <div class="detail-media-grid">
              @for (item of project.media; track item.url) {
                @if (item.type === 'image' && item.url) {
                  <button type="button" class="detail-media-item" (click)="openLightbox(item.url, item.alt || project.title)" [attr.aria-label]="'View image: ' + (item.alt || project.title)">
                    <img [src]="item.url" [alt]="item.alt || project.title" class="detail-media-img" loading="lazy" />
                  </button>
                }
              }
            </div>
          </section>
        }

        @if (project.submilestones && project.submilestones.length > 0) {
          <section class="detail-section">
            <h3 class="detail-section-label">Milestones</h3>
            <div class="detail-submilestones">
              @for (submilestone of project.submilestones; track submilestone.id) {
                <div class="submilestone-entry">
                  <div class="submilestone-marker"></div>
                  <div class="submilestone-body">
                    <div class="submilestone-header">
                      <h4 class="submilestone-entry-title">{{ submilestone.title }}</h4>
                      <span class="submilestone-entry-date">{{ submilestone.date | date:'MMM dd, yyyy' }}</span>
                    </div>
                    <p class="submilestone-entry-desc">{{ submilestone.description }}</p>
                  </div>
                </div>
              }
            </div>
          </section>
        }

        <section class="detail-section">
          <h3 class="detail-section-label">Technologies</h3>
          <ul class="detail-tech-list">
            @for (tech of project.technologies; track tech) {
              <li>{{ tech }}</li>
            }
          </ul>
        </section>

        @if (project.links && project.links.length > 0) {
          <section class="detail-section">
            <h3 class="detail-section-label">Links</h3>
            <ul class="detail-links">
              @for (link of project.links; track link.url) {
                <li>
                  <a
                    [href]="link.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="detail-link">
                    {{ link.label }} ↗
                  </a>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    </aside>

    @if (lightboxUrl) {
      <div class="lightbox-backdrop" (click)="closeLightbox()" role="dialog" aria-modal="true" [attr.aria-label]="lightboxAlt">
        <button type="button" class="lightbox-close" (click)="closeLightbox()" aria-label="Close image">✕</button>
        <img class="lightbox-img" [src]="lightboxUrl" [alt]="lightboxAlt" (click)="$event.stopPropagation()" />
      </div>
    }
  `,
  styleUrl: './project-detail.component.scss'
})
export class ProjectDetailComponent {
  @Input({ required: true }) project!: Project;
  @Output() close = new EventEmitter<void>();

  lightboxUrl: string | null = null;
  lightboxAlt: string = '';

  openLightbox(url: string, alt: string): void {
    this.lightboxUrl = url;
    this.lightboxAlt = alt;
  }

  closeLightbox(): void {
    this.lightboxUrl = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.lightboxUrl) this.closeLightbox();
  }
}
