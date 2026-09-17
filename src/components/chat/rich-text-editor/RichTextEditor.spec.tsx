import { describe, it, expect } from 'vitest';
import { createRef } from 'react';
import { render, act } from '@testing-library/react';
import { RichTextEditor, RichTextEditorRef } from './RichTextEditor';

/**
 * Regression guard for PR #233 (fix(composer): keep empty editor doc
 * schema-valid). The empty state is a single empty paragraph (schema requires
 * `doc: block+`), which serializes to a truthy `'<p></p>'`. getContent() must
 * still report the cleared editor as '' so callers' empty-checks keep working
 * (handleSend early return, canSend). If a future refactor lets the empty doc
 * leak through as `'<p></p>'`, these tests fail before it reaches the composer.
 */
describe('RichTextEditor empty-state contract (PR #233)', () => {
  const mount = () => {
    const ref = createRef<RichTextEditorRef>();
    render(<RichTextEditor ref={ref} />);
    return ref;
  };

  it('reports a freshly mounted (empty) editor as ""', () => {
    const ref = mount();
    expect(ref.current?.getContent()).toBe('');
  });

  it('reports the editor as "" after clear()', () => {
    const ref = mount();
    act(() => ref.current?.setContent('hello'));
    expect(ref.current?.getContent()).toBe('<p>hello</p>');

    act(() => ref.current?.clear());
    expect(ref.current?.getContent()).toBe('');
  });

  it('reports the editor as "" after setContent("")', () => {
    const ref = mount();
    act(() => ref.current?.setContent('hello'));
    act(() => ref.current?.setContent(''));
    expect(ref.current?.getContent()).toBe('');
  });

  it('serializes real content instead of collapsing it to ""', () => {
    const ref = mount();
    act(() => ref.current?.setContent('não colapsar'));
    expect(ref.current?.getContent()).toBe('<p>não colapsar</p>');
  });
});

describe('RichTextEditor multiline and canned responses formatting', () => {
  const mount = () => {
    const ref = createRef<RichTextEditorRef>();
    render(<RichTextEditor ref={ref} />);
    return ref;
  };

  it('splits plain text with double newlines into separate paragraphs', () => {
    const ref = mount();
    act(() => ref.current?.setContent('Parágrafo 1\n\nParágrafo 2'));
    expect(ref.current?.getContent()).toBe('<p>Parágrafo 1</p><p>Parágrafo 2</p>');
  });

  it('formats WhatsApp markdown (*bold*) into <strong>', () => {
    const ref = mount();
    act(() => ref.current?.setContent('Texto com *negrito* aqui'));
    expect(ref.current?.getContent()).toBe('<p>Texto com <strong>negrito</strong> aqui</p>');
  });

  it('converts single newlines into hard breaks (<br>) within paragraph', () => {
    const ref = mount();
    act(() => ref.current?.setContent('Linha 1\nLinha 2'));
    expect(ref.current?.getContent()).toBe('<p>Linha 1<br>Linha 2</p>');
  });
});

