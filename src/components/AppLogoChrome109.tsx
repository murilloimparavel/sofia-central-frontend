import type { CSSProperties } from 'react';

interface AppLogoChrome109Props {
  className?: string;
  alt?: string;
  style?: CSSProperties;
  forceTheme?: 'dark' | 'light';
}

/** Lightweight text wordmark for the constrained login profile. */
export function AppLogo({
  className,
  alt = 'SOFIA Central',
  style,
}: AppLogoChrome109Props) {
  return (
    <div
      role="img"
      aria-label={alt}
      className={`inline-flex items-baseline justify-center gap-1 whitespace-nowrap text-foreground ${className || ''}`}
      style={style}
    >
      <span className="font-bold tracking-tight">SOFIA</span>
      {' '}
      <span className="font-normal">Central</span>
    </div>
  );
}
