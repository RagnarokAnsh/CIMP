import { ThemeProvider as NextThemesProvider } from 'next-themes';

// First-class light + dark, system-following and persisted (storageKey "theme").
// A tiny inline script in index.html applies the class before paint to avoid FOUC.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
