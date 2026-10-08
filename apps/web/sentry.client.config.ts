import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  debug: false,
  beforeSend(event) {
    if (event.request) {
      if (event.request.headers) {
        delete event.request.headers.cookie;
      }
      if (event.request.data) {
        let data = event.request.data;
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (e) {}
        }
        if (typeof data === 'object' && data !== null) {
          const dataObj = data as Record<string, any>;
          if (dataObj.email) dataObj.email = '[Scrubbed]';
          if (dataObj.body) dataObj.body = '[Scrubbed]';
        }
        event.request.data = data;
      }
    }
    return event;
  }
});
