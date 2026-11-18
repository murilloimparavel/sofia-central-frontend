import React from 'react';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { Button } from '@evoapi/design-system/button';

interface BannerProps {
  /** Optional heading that explains the restriction at a glance. */
  title?: string;

  /**
   * Main banner message text
   */
  bannerMessage: string;

  /**
   * Optional external link
   */
  hrefLink?: string;

  /**
   * Link text to display
   */
  hrefLinkText?: string;

  /**
   * Optional action button
   */
  hasActionButton?: boolean;

  /**
   * Action button label
   */
  actionButtonLabel?: string;

  /**
   * Action button click handler
   */
  onPrimaryAction?: () => void;

  /**
   * Color scheme of the banner
   * @default 'alert'
   */
  colorScheme?: 'primary' | 'secondary' | 'alert' | 'warning';
}

const Banner: React.FC<BannerProps> = ({
  title,
  bannerMessage,
  hrefLink,
  hrefLinkText,
  hasActionButton = false,
  actionButtonLabel,
  onPrimaryAction,
  colorScheme = 'alert',
}) => {
  // Keep the alert informative and readable in both themes. The restriction
  // is expected policy guidance, not a system failure.
  const colorSchemeClasses = {
    primary: 'border-primary/20 bg-primary/5 text-foreground',
    secondary: 'border-border bg-secondary text-secondary-foreground',
    alert: 'border-destructive/25 bg-destructive/5 text-foreground dark:bg-destructive/10',
    warning:
      'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/45 dark:text-amber-100',
  };
  const iconClasses = {
    primary: 'bg-primary/10 text-primary',
    secondary: 'bg-background/70 text-secondary-foreground',
    alert: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
    warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/70 dark:text-amber-200',
  };

  return (
    <div
      role="status"
      className={`mx-2 mt-2 flex shrink-0 items-start gap-3 rounded-xl border px-3.5 py-3 sm:px-4 ${colorSchemeClasses[colorScheme]}`}
    >
      <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClasses[colorScheme]}`}>
        <AlertCircle className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold leading-5">{title}</p>}
        <p className={`banner-message text-sm leading-5 ${title ? 'mt-0.5 text-current/80' : ''}`}>
          {bannerMessage}{' '}
          {hrefLink && hrefLinkText && (
            <a
              href={hrefLink}
              rel="noopener noreferrer nofollow"
              target="_blank"
              className="inline-flex items-center gap-1 rounded-sm font-semibold underline decoration-current/50 underline-offset-4 transition-colors hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {hrefLinkText}
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </p>
      </div>

      {hasActionButton && actionButtonLabel && (
        <Button
          size="sm"
          variant="secondary"
          onClick={onPrimaryAction}
          className="h-8 shrink-0 text-xs"
        >
          {actionButtonLabel}
        </Button>
      )}
    </div>
  );
};

export default Banner;
