import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

import { AppLogo } from '@/components/AppLogo';

interface LoadingScreenProps {
  fullScreen?: boolean;
  showLogo?: boolean;
  className?: string;
}

const LoadingScreen = ({ fullScreen = false, showLogo = false, className }: LoadingScreenProps) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center bg-background text-foreground',
        fullScreen && 'h-screen',
        className,
      )}
    >
      {showLogo && (
        <AppLogo className="w-1/4 mb-4" />
      )}
      <Loader2
        className={cn(
          'h-8 w-8 animate-spin text-primary'
        )}
      />
    </div>
  );
};

export default LoadingScreen;
