import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ConversationScopeTabs from './ConversationScopeTabs';
import { CONVERSATION_SCOPE_PRESETS } from './conversationSegmentsHelpers';
import type { ConversationFilter } from '@/types/chat/api';

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, fallback: string) => {
      if (key === 'chatSidebar.scopeTabs.mine') return 'Chats';
      if (key === 'chatSidebar.scopeTabs.unassigned') return 'Fila';
      if (key === 'chatSidebar.scopeTabs.bot') return 'Robô';
      if (key === 'chatSidebar.scopeTabs.all') return 'Todas';
      return fallback;
    },
  }),
}));

const cf = (key: string, value: string): ConversationFilter =>
  ({ attribute_key: key, filter_operator: 'equal_to', values: [value] } as unknown as ConversationFilter);

describe('ConversationScopeTabs', () => {
  it('renders all four scope tabs in the exact order: Chats, Fila, Robô, Todas', () => {
    const onSelectScope = vi.fn();
    render(<ConversationScopeTabs activeFilters={[]} onSelectScope={onSelectScope} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    expect(tabs[0]).toHaveTextContent('Chats');
    expect(tabs[1]).toHaveTextContent('Fila');
    expect(tabs[2]).toHaveTextContent('Robô');
    expect(tabs[3]).toHaveTextContent('Todas');
  });

  it('marks Robô as selected when status is pending', () => {
    const onSelectScope = vi.fn();
    const activeFilters = [cf('assignee_type', 'all'), cf('status', 'pending')];

    render(<ConversationScopeTabs activeFilters={activeFilters} onSelectScope={onSelectScope} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[3]).toHaveAttribute('aria-selected', 'false');
  });

  it('leaves all scope tabs unselected for custom filters', () => {
    render(<ConversationScopeTabs activeFilters={[cf('priority', 'high')]} onSelectScope={vi.fn()} />);
    expect(screen.getAllByRole('tab').every(tab => tab.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('calls onSelectScope with CONVERSATION_SCOPE_PRESETS.bot when Robô tab is clicked', () => {
    const onSelectScope = vi.fn();
    render(<ConversationScopeTabs activeFilters={[]} onSelectScope={onSelectScope} />);

    const roboTab = screen.getByRole('tab', { name: /Robô/i });
    fireEvent.click(roboTab);

    expect(onSelectScope).toHaveBeenCalledWith(CONVERSATION_SCOPE_PRESETS.bot);
  });

  it('disables all tabs when disabled prop is true', () => {
    const onSelectScope = vi.fn();
    render(<ConversationScopeTabs activeFilters={[]} onSelectScope={onSelectScope} disabled={true} />);

    const tabs = screen.getAllByRole('tab');
    tabs.forEach(tab => {
      expect(tab).toBeDisabled();
    });
  });
});
