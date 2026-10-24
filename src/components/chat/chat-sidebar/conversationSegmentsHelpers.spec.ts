import { describe, expect, it } from 'vitest';
import {
  CONVERSATION_SEGMENTS,
  getActiveSegmentId,
  CONVERSATION_SCOPE_PRESETS,
  getActiveConversationScope,
} from './conversationSegmentsHelpers';
import { convertBaseFiltersToConversationFilters } from '@/utils/chat/filterAdapters';
import { shouldUseAdvancedFilters, convertFiltersToUrlParams } from '@/utils/chat/filterConverters';
import type { ConversationFilter } from '@/types/chat/api';

// The "unanswered" chip has to match the sidebar badge and reach the backend through
// the path that can filter it.
describe('conversationSegmentsHelpers — unanswered (EVO-1963)', () => {
  const cf = (key: string, value: string): ConversationFilter =>
    ({ attribute_key: key, filter_operator: 'equal_to', values: [value] } as unknown as ConversationFilter);

  const unanswered = CONVERSATION_SEGMENTS.find(s => s.id === 'unanswered')!;

  it('has an unanswered segment', () => {
    expect(unanswered).toBeDefined();
    expect(unanswered.preset.map(f => `${f.attributeKey}=${f.values}`)).toEqual(['unanswered=true']);
  });

  // A multi-row preset goes to POST /filter, which has no `unanswered` attribute.
  it('routes through the GET path, not POST /filter (single-row preset)', () => {
    const apiFilters = convertBaseFiltersToConversationFilters(unanswered.preset);
    expect(shouldUseAdvancedFilters(apiFilters)).toBe(false);
    expect(convertFiltersToUrlParams(apiFilters).unanswered).toBe(true);
  });

  it('every segment preset routes through the GET path', () => {
    for (const segment of CONVERSATION_SEGMENTS) {
      const apiFilters = convertBaseFiltersToConversationFilters(segment.preset);
      expect(shouldUseAdvancedFilters(apiFilters)).toBe(false);
    }
  });

  it('detects the unanswered segment from active filters', () => {
    expect(getActiveSegmentId([cf('unanswered', 'true')])).toBe('unanswered');
  });

  it('does not confuse unread with unanswered', () => {
    expect(getActiveSegmentId([cf('unread', 'true')])).toBe('unread');
  });
});

describe('conversationSegmentsHelpers — Scope Tabs: Chats, Fila, Robô, Todas', () => {

  it('defines the correct operational presets for all four scopes', () => {
    // Chats: Meus atendimentos abertos
    expect(CONVERSATION_SCOPE_PRESETS.mine.map(f => `${f.attributeKey}=${f.values}`)).toEqual([
      'assignee_type=me',
      'status=open',
    ]);

    // Fila: Atendimentos abertos sem responsável
    expect(CONVERSATION_SCOPE_PRESETS.unassigned.map(f => `${f.attributeKey}=${f.values}`)).toEqual([
      'assignee_type=unassigned',
      'status=open',
    ]);

    // Robô: Atendimentos sob controle da IA (status pending)
    expect(CONVERSATION_SCOPE_PRESETS.bot.map(f => `${f.attributeKey}=${f.values}`)).toEqual([
      'assignee_type=all',
      'status=pending',
    ]);

    // Todas: Visão global com todos os status
    expect(CONVERSATION_SCOPE_PRESETS.all.map(f => `${f.attributeKey}=${f.values}`)).toEqual([
      'assignee_type=all',
      'status=all',
    ]);
  });

  it('routes all four scope presets through the fast GET path (not heavy POST /filter)', () => {
    const mineFilters = convertBaseFiltersToConversationFilters(CONVERSATION_SCOPE_PRESETS.mine);
    const unassignedFilters = convertBaseFiltersToConversationFilters(
      CONVERSATION_SCOPE_PRESETS.unassigned,
    );
    const botFilters = convertBaseFiltersToConversationFilters(CONVERSATION_SCOPE_PRESETS.bot);
    const allFilters = convertBaseFiltersToConversationFilters(CONVERSATION_SCOPE_PRESETS.all);

    expect(shouldUseAdvancedFilters(mineFilters)).toBe(false);
    expect(shouldUseAdvancedFilters(unassignedFilters)).toBe(false);
    expect(shouldUseAdvancedFilters(botFilters)).toBe(false);
    expect(shouldUseAdvancedFilters(allFilters)).toBe(false);
  });

  it('converts scope presets to exact GET query parameters', () => {
    const mineParams = convertFiltersToUrlParams(
      convertBaseFiltersToConversationFilters(CONVERSATION_SCOPE_PRESETS.mine),
    );
    expect(mineParams).toEqual({
      status: 'open',
      assignee_type: 'me',
    });

    const unassignedParams = convertFiltersToUrlParams(
      convertBaseFiltersToConversationFilters(CONVERSATION_SCOPE_PRESETS.unassigned),
    );
    expect(unassignedParams).toEqual({
      status: 'open',
      assignee_type: 'unassigned',
    });

    const botParams = convertFiltersToUrlParams(
      convertBaseFiltersToConversationFilters(CONVERSATION_SCOPE_PRESETS.bot),
    );
    expect(botParams).toEqual({
      status: 'pending',
      assignee_type: 'all',
    });

    const allParams = convertFiltersToUrlParams(
      convertBaseFiltersToConversationFilters(CONVERSATION_SCOPE_PRESETS.all),
    );
    expect(allParams).toEqual({
      status: 'all',
      assignee_type: 'all',
    });
  });

  it('identifies the active conversation scope correctly', () => {
    const cf = (key: string, value: string): ConversationFilter =>
      ({ attribute_key: key, filter_operator: 'equal_to', values: [value] } as unknown as ConversationFilter);

    expect(getActiveConversationScope([cf('assignee_type', 'me'), cf('status', 'open')])).toBe('mine');
    expect(getActiveConversationScope([cf('assignee_type', 'unassigned'), cf('status', 'open')])).toBe('unassigned');
    expect(getActiveConversationScope([cf('status', 'pending')])).toBe(null);
    expect(getActiveConversationScope([cf('assignee_type', 'all'), cf('status', 'pending')])).toBe('bot');
    expect(getActiveConversationScope([cf('assignee_type', 'all'), cf('status', 'pending'), cf('priority', 'high')])).toBe(null);
    expect(getActiveConversationScope([cf('assignee_type', 'me'), cf('status', 'all')])).toBe(null);
    expect(getActiveConversationScope([
      { ...cf('assignee_type', 'all'), query_operator: 'or' }, cf('status', 'pending'),
    ])).toBe(null);
    expect(getActiveConversationScope([
      { ...cf('assignee_type', 'all'), values: ['all', 'me'] }, cf('status', 'pending'),
    ])).toBe(null);
    expect(getActiveConversationScope([cf('assignee_type', 'all'), cf('status', 'all')])).toBe('all');
    expect(getActiveConversationScope([cf('status', 'all')])).toBe(null);
  });

  it('properly routes complex filters to POST /conversations/filter', () => {
    const priorityFilter = [
      { attribute_key: 'priority', filter_operator: 'equal_to', values: ['high'] } as unknown as ConversationFilter,
    ];
    expect(shouldUseAdvancedFilters(priorityFilter)).toBe(true);

    const orOperatorFilter = [
      { attribute_key: 'status', filter_operator: 'equal_to', values: ['open'], query_operator: 'or' } as unknown as ConversationFilter,
    ];
    expect(shouldUseAdvancedFilters(orOperatorFilter)).toBe(true);

    const notEqualFilter = [
      { attribute_key: 'status', filter_operator: 'not_equal_to', values: ['resolved'] } as unknown as ConversationFilter,
    ];
    expect(shouldUseAdvancedFilters(notEqualFilter)).toBe(true);
  });
});
