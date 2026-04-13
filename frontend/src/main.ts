import { bootstrapApplication } from '@angular/platform-browser';
import { inject as injectAnalytics } from '@vercel/analytics';
import { appConfig } from './app/app.config';
import { App } from './app/app';

injectAnalytics();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
