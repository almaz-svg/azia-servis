'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useApp } from '@/features/app/AppProvider';
import { LANGS, t, type Lang } from '@/i18n';

/**
 * Оболочка: шапка (название, язык, метка «Демо-данные») и левое меню с шагами.
 * Метка демо видна на всех экранах (ТЗ, F11).
 */

interface NavItem {
  key: 'data' | 'topics' | 'textbooks' | 'hours' | 'trial';
  href: string;
  enabled: boolean;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { lang, setLang, dataset } = useApp();
  const pathname = usePathname();

  // Пункты меню, которых нет в MVP, и аналитические экраны до загрузки данных — неактивны (ТЗ, краевые случаи)
  const items: NavItem[] = [
    { key: 'data', href: '/data', enabled: true },
    { key: 'topics', href: '/topics', enabled: dataset !== null },
    { key: 'textbooks', href: '/textbooks', enabled: dataset !== null },
    { key: 'hours', href: '/hours', enabled: dataset !== null },
    { key: 'trial', href: '/trial', enabled: false },
  ];

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-name">{t(lang, 'app.title')}</span>
          <span className="brand-tagline">{t(lang, 'app.tagline')}</span>
        </div>
        <div className="header-tools">
          {dataset?.source === 'demo' && <DemoBadge lang={lang} />}
          <LangToggle lang={lang} onChange={setLang} />
        </div>
      </header>

      <div className="layout">
        <nav className="rail" aria-label="Шаги">
          <ol>
            {items.map((item, i) => {
              const active = pathname === item.href;
              const label = t(lang, `nav.${item.key}`);
              return (
                <li key={item.key}>
                  {item.enabled ? (
                    <Link href={item.href} className="rail-link" aria-current={active ? 'page' : undefined}>
                      <span className="rail-num">{i + 1}</span>
                      <span>{label}</span>
                    </Link>
                  ) : (
                    <span className="rail-link is-disabled" aria-disabled="true">
                      <span className="rail-num">{i + 1}</span>
                      <span>{label}</span>
                      <span className="rail-soon">{t(lang, 'nav.soon')}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="main" id="main">
          {children}
        </main>
      </div>

      <footer className="app-footer">{t(lang, 'app.config', { version: '1.0.0' })}</footer>
    </div>
  );
}

export function DemoBadge({ lang }: { lang: Lang }) {
  return <span className="demo-badge">{t(lang, 'demo.badge')}</span>;
}

function LangToggle({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
  return (
    <div className="lang-toggle" role="group" aria-label={t(lang, 'lang.switch')}>
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          className="lang-btn"
          aria-pressed={lang === code}
          onClick={() => onChange(code)}
        >
          {t(lang, `lang.${code}`)}
        </button>
      ))}
    </div>
  );
}
