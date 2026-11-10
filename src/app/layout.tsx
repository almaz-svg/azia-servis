import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppShell } from '@/features/shell/AppShell';
import { AppProvider } from '@/features/app/AppProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Сынақ',
  description: 'Учебники и учебные часы — по результатам, а не по мнению',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // lang страницы выставляет AppProvider вместе с языком интерфейса
  return (
    <html lang="ru">
      <head>
        {/* ТЗ: Unbounded и Golos Text из Google Fonts, с кириллицей и казахскими буквами */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600&family=Unbounded:wght@500;600&display=swap"
        />
      </head>
      <body>
        <AppProvider>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
