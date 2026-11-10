import type { Metadata } from 'next';
import { Golos_Text, Unbounded } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppShell } from '@/features/shell/AppShell';
import { AppProvider } from '@/features/app/AppProvider';
import './globals.css';

// ТЗ: Unbounded и Golos Text с кириллицей и казахскими буквами (cyrillic-ext).
// next/font скачивает шрифты при сборке и раздаёт их сам: на защите интерфейс не зависит от Google Fonts.
const golos = Golos_Text({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-golos',
  display: 'swap',
});
const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic', 'cyrillic-ext'],
  weight: ['500', '600'],
  variable: '--font-unbounded',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Сынақ',
  description: 'Учебники и учебные часы — по результатам, а не по мнению',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // lang страницы выставляет AppProvider вместе с языком интерфейса
  return (
    <html lang="ru" className={`${golos.variable} ${unbounded.variable}`}>
      <body>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
