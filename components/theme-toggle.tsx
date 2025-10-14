'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Button } from './ui/button';
import { Moon, Sun } from 'lucide-react';

interface ThemeToggleProps { className?: string }

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    // Render a stable placeholder that matches server and first client render
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={className}
        aria-label="Toggle theme"
        aria-pressed={false}      // or omit: aria-pressed={undefined}
        suppressHydrationWarning  // optional extra safety for this subtree
      >
        <Moon className="h-5 w-5" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={className}
      aria-label="Toggle theme"
      aria-pressed={isDark}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
