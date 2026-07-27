import { Languages } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LOCALES, LOCALE_CODES, useT } from './index';

// Language picker for the reporter portal. Each language is listed in its own
// endonym ("Español", not "Spanish") — someone who can't read the current UI
// language still has to be able to find theirs.
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('nav.language')} title={t('nav.language')}>
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>{t('nav.language')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LOCALE_CODES.map((code) => (
          <DropdownMenuItem
            key={code}
            onSelect={() => setLocale(code)}
            className={cn(code === locale && 'font-medium text-primary')}
          >
            {LOCALES[code].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
