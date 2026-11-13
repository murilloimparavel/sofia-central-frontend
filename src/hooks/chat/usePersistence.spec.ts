import { describe, expect, it } from 'vitest';
import { restoreChatFilters } from './usePersistence';
import type { ConversationFilter } from '@/types/chat/api';

const urgent: ConversationFilter = { attribute_key: 'urgent_followup', filter_operator: 'equal_to', values: ['true'], query_operator: 'and' };
const priority: ConversationFilter = { attribute_key: 'priority', filter_operator: 'equal_to', values: ['high'], query_operator: 'and' };

describe('restoreChatFilters', () => {
  it('restores all conversations when urgent was the only filter', () => {
    expect(restoreChatFilters([urgent]).map(filter => filter.attribute_key)).toEqual(['assignee_type', 'status']);
  });
  it('preserves other filters', () => {
    expect(restoreChatFilters([urgent, priority])).toEqual([priority]);
  });
});
