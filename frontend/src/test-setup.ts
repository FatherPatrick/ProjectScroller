// Global browser API stubs missing from the jsdom test environment.

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false
    }) as MediaQueryList;
}

if (typeof window.IntersectionObserver !== 'function') {
  class IntersectionObserverStub {
    observe(): void {
      /* noop */
    }
    unobserve(): void {
      /* noop */
    }
    disconnect(): void {
      /* noop */
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  window.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

if (typeof window.scrollTo !== 'function') {
  window.scrollTo = () => undefined;
}
