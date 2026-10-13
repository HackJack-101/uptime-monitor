export type Theme = 'light' | 'dark' | 'system';

export function getTheme(): Theme {
  return (localStorage.getItem('theme') as Theme | null) ?? 'system';
}

export function applyTheme(theme: Theme): void {
  localStorage.setItem('theme', theme);
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}
