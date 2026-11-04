import { describe, expect, it } from 'vitest';
import { contextFieldOptions } from './classificationCatalogForm';
import type { CustomAttributeDefinition } from '@/types/settings/customAttributes';

const enumAttribute = (values: string[]): CustomAttributeDefinition => ({
  id: 'interest', attribute_key: 'interest', attribute_display_name: 'Interest',
  attribute_model: 'conversation_attribute', attribute_display_type: 'list',
  attribute_values: values, created_at: '', updated_at: '',
});

describe('classification context field options', () => {
  it.each([
    [], ['with space'], ['ação'], ['Interested'], ['yes', 'yes'], ['a'.repeat(65)],
    Array.from({ length: 17 }, (_, index) => `option_${index}`),
  ].map(values => ({ values })))('does not offer enum values unsupported by the backend: $values', ({ values }) => {
    expect(contextFieldOptions([enumAttribute(values)])).toEqual([]);
  });

  it('preserves valid machine values without converting display text', () => {
    const values = ['interested', 'not_interested'];
    const options = contextFieldOptions([enumAttribute(values)]);
    expect(options).toHaveLength(1);
    expect(options[0].field.allowed_values).toEqual(values);
    expect(options[0].label).toBe('Interest');
  });
});
