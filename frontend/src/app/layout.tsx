import '@/styles/globals.css';
import type { Metadata } from 'next';
import { LanguageProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'LLM Response Quality Evaluation',
  description: 'Bilingual evaluation rubric survey with auto-save',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
