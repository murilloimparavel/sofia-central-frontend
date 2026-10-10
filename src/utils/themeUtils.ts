// Função auxiliar para inicializar o tema antes do React montar
export function initTheme(storageKey = 'theme') {
  // Verificar localStorage
  const savedTheme = localStorage.getItem(storageKey);
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else if (savedTheme === 'light') {
    document.documentElement.classList.remove('dark');
  } else {
    // Verificar preferência do sistema
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      document.documentElement.classList.add('dark');
    }
  }
}
