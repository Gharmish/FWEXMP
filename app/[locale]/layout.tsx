import type { Metadata } from 'next';
import { bricolage, ibmPlexArabic } from '@/lib/fonts';
import '../globals.css';

export const metadata: Metadata = {
  title: 'Gharmish',
  description: 'Experiences hosted by the people who know Asir best.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${ibmPlexArabic.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
