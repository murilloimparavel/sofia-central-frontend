import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppLogo } from './AppLogoChrome109';

describe('AppLogoChrome109', () => {
  it('renders an accessible text wordmark without an image request', () => {
    render(<AppLogo className="h-10 mx-auto" />);

    expect(screen.getByRole('img', { name: 'SOFIA Central' })).toHaveTextContent('SOFIA Central');
    expect(screen.queryByRole('img', { name: 'SOFIA Central' })?.querySelector('img')).toBeNull();
  });
});
