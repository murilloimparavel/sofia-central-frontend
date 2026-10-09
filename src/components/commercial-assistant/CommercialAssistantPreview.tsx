import CommercialAssistantPopup from './CommercialAssistantPopup';

export default function CommercialAssistantPreview() {
  return (
    <main className="assistant-preview-page">
      <section className="assistant-preview-card">
        <p className="assistant-preview-eyebrow">Prévia local</p>
        <h1>Assistente comercial integrado</h1>
        <p className="assistant-preview-description">
          Use o botão no canto inferior direito para abrir o popup dentro do clone do CRM.
        </p>
      </section>
      <CommercialAssistantPopup initiallyOpen />
    </main>
  );
}
