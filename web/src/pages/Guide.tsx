import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { Card, PageHeader } from '../components/ui';
import { getLocale, t, type Locale } from '../i18n';
import * as en from './guide/en';
import * as fr from './guide/fr';

const CONTENT: Record<Locale, { sections: { id: string; title: string }[]; Content: () => ReactNode }> = { 'en-US': en, 'fr-FR': fr };


export function GuidePage() {
  const { sections: SECTIONS, Content } = CONTENT[getLocale()];
  const [active, setActive] = useState('start');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px' },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [SECTIONS]);

  return (
    <>
      <PageHeader title={t('guide.title')} description={t('guide.description')} />
      <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
        <nav className="mb-6 lg:mb-0">
          <div className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-2 lg:sticky lg:top-10 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={clsx(
                  'shrink-0 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                  active === s.id
                    ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100',
                )}
              >
                {s.title}
              </a>
            ))}
          </div>
        </nav>

        <Card className="prose-guide min-w-0 px-5 py-2 sm:px-8 sm:py-4">
          <Content />
        </Card>
      </div>
    </>
  );
}
