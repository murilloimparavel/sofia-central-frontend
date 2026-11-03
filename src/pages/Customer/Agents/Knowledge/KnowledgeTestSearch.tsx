import { useState } from 'react';
import api from '@/services/core/api';

type Result = { id: string; title: string; excerpt: string; source?: string | null };

export default function KnowledgeTestSearch({ baseId }: { baseId: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function search() {
    if (busy || !query.trim()) return;
    setBusy(true);
    setError('');
    setResults(null);
    try {
      const { data } = await api.post(`/knowledge_bases/${baseId}/test_retrieval`, {
        query: query.trim(),
      });
      if (!Array.isArray(data.data)) throw new Error('invalid response');
      setResults(data.data);
    } catch {
      setError('Não foi possível testar a busca. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-border bg-card p-5"
      aria-labelledby="knowledge-test-title"
    >
      <div>
        <h2 id="knowledge-test-title" className="font-semibold">
          Testar busca
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Veja os conteúdos publicados desta base que correspondem à pergunta.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={event => {
          event.preventDefault();
          void search();
        }}
      >
        <label className="min-w-56 flex-1 text-sm">
          Pergunta
          <input
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            maxLength={500}
            value={query}
            disabled={busy}
            onChange={event => {
              setQuery(event.target.value);
              setResults(null);
              setError('');
            }}
          />
        </label>
        <button
          className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          disabled={busy || !query.trim()}
          type="submit"
        >
          {busy ? 'Buscando…' : 'Buscar'}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {results &&
        (results.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum conteúdo publicado encontrado.</p>
        ) : (
          <ul className="space-y-3">
            {results.map(item => (
              <li key={item.id} className="rounded-lg border p-3">
                <h3 className="font-medium">{item.title}</h3>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.excerpt}</p>
                {item.source && (
                  <p className="mt-2 text-xs text-muted-foreground">Fonte: {item.source}</p>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
