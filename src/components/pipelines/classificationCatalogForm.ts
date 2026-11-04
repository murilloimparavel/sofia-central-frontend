import type { CustomAttributeDefinition } from '@/types/settings/customAttributes';
import type { ClassificationCatalog, ClassificationCatalogWrite, ClassificationContextField } from '@/types/pipelines/classificationCatalog';

export function catalogWrite(catalog: ClassificationCatalog): ClassificationCatalogWrite {
  return {
    classification: catalog.classification,
    stages: catalog.stages,
    expected_hash: catalog.draft_hash,
  };
}

// Offer persisted boolean/enum definitions only. Names alone never confer authority.
export function contextFieldOptions(attributes: CustomAttributeDefinition[]): Array<{
  label: string;
  field: ClassificationContextField;
}> {
  return attributes.flatMap<{ label: string; field: ClassificationContextField }>(attribute => {
    if (!['conversation_attribute', 'contact_attribute'].includes(attribute.attribute_model)) return [];
    const owner = attribute.attribute_model === 'conversation_attribute' ? 'conversation' : 'contact';
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(attribute.attribute_key)) return [];
    const base = {
      key: `${owner}_${attribute.attribute_key}`,
      source: `${owner}.custom_attributes` as ClassificationContextField['source'],
      field: attribute.attribute_key,
    };
    if (base.key.length > 64) return [];
    if (attribute.attribute_display_type === 'checkbox') {
      return [{ label: attribute.attribute_display_name, field: { ...base, type: 'boolean' as const } }];
    }
    const values = attribute.attribute_values;
    const supportedEnum = Array.isArray(values) && values.length >= 1 && values.length <= 16 &&
      new Set(values).size === values.length && values.every(value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value));
    if (attribute.attribute_display_type === 'list' && supportedEnum) {
      return [{ label: attribute.attribute_display_name, field: {
        ...base, type: 'enum' as const, allowed_values: values,
      } }];
    }
    return [];
  });
}
