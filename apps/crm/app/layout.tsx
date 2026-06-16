import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Transcribator',
  description: 'Local transcription and video download CRM.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
