import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'chaoquncalender 日程清单',
  description: '一个轻盈好用的个人日历与待办清单。',
  openGraph: {
    title: 'chaoquncalender 日程清单',
    description: '把每一天过清楚。',
    images: [{ url: '/og.png', width: 1536, height: 1024, alt: 'chaoquncalender 日程清单' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'chaoquncalender 日程清单',
    description: '把每一天过清楚。',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body></html>;
}
