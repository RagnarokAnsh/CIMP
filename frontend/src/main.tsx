import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { captureHandoffToken } from './api/handoff';
import { captureDiagnosticsFragment } from './api/diagnostics';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// Grab the SDK diagnostics fragment, then the portal hand-off token, before
// anything renders (both strip themselves from the address bar). The hand-off
// capture is given the cache so that swapping reporters — which the postMessage
// path does in place, with no page load — cannot leave the previous reporter's
// issues cached and visible to the next one.
captureDiagnosticsFragment();
captureHandoffToken(() => queryClient.clear());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <TooltipProvider>
            <App />
          </TooltipProvider>
          <Toaster richColors position="top-right" />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
