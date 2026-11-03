export interface ClassificationContextField {
  key: string;
  source: 'conversation.custom_attributes' | 'contact.custom_attributes';
  field: string;
  type: 'boolean' | 'enum';
  allowed_values?: string[];
}

export interface StageClassificationProfile {
  classification_enabled: boolean;
  definition: string;
  entry_criteria: string[];
  stay_criteria: string[];
  exit_criteria: string[];
  incompatible_conditions: string[];
  sufficient_examples: string[];
  insufficient_examples: string[];
}

export interface PipelineClassificationProfile {
  schema_version: 1;
  enabled: boolean;
  mode: 'off' | 'observe';
  purpose: string;
  model: string;
  question_version: string;
  debounce_ms: number;
  snapshot_ttl_seconds: number;
  result_ttl_seconds: number;
  inbox_ids: string[];
  context_sources: { fields: ClassificationContextField[]; stage_key?: string };
  thresholds: { stage_candidate: number };
}

export interface ClassificationCatalogContent {
  classification: PipelineClassificationProfile;
  stages: Array<{ id: string; name: string; classification_profile: StageClassificationProfile }>;
}

export interface ClassificationLegacyReference {
  pipeline_description: string | null;
  stages: Array<{ id: string; description: string | null }>;
}

export interface ClassificationCatalog extends ClassificationCatalogContent {
  legacy_reference?: ClassificationLegacyReference;
  draft_hash: string;
  catalog_version: number;
  catalog_hash: string | null;
  published: boolean;
  dirty: boolean;
  model_options: Array<{ id: string; label: string; provider: 'openrouter' }>;
  credential_status: { configured: boolean; provider: 'openrouter' };
  limits: {
    max_stages: number;
    max_criteria: number;
    max_text_length: number;
    max_questions: number;
    max_context_fields: number;
  };
}

export interface ClassificationCatalogWrite extends ClassificationCatalogContent {
  expected_hash: string;
}

export interface ClassificationCatalogPreview {
  legacy_reference?: ClassificationLegacyReference;
  valid: boolean;
  draft_hash: string;
  compiled: {
    compiler_version: string;
    model: string;
    question_version: string;
    aliases: Record<string, string>;
    questions: Record<string, {
      type: string;
      instructions: string;
      criteria: Record<string, unknown>;
    }>;
  };
}
