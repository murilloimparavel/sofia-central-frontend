import type { CSSProperties } from 'react';
import { useDarkMode } from '../hooks/useDarkMode';
import logoDark from '../assets/sofia_logo_dark.png';
import logoLight from '../assets/sofia_logo_light.png';

interface AppLogoProps {
  className?: string;
  alt?: string;
  style?: CSSProperties;
  forceTheme?: 'dark' | 'light';
}

export function AppLogo({ className, alt = 'Sofia Central', style, forceTheme }: AppLogoProps) {
  const { theme } = useDarkMode();
  const effectiveTheme = forceTheme ?? theme;
  const src = effectiveTheme === 'dark' ? logoDark : logoLight;

  return (
    <img
      src={src}
      alt={alt}
      className={className ? `${className} object-contain` : 'object-contain'}
      style={style}
    />
  );
}
