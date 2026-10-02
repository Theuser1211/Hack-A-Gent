import './globals.css';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';

export const metadata = {
  title: 'Quarry',
  description: 'Quarry — a reverse search engine that turns a vague memory into the exact video, article, or song you cannot name.',
  openGraph: { title: 'Quarry', description: 'Quarry — a reverse search engine that turns a vague memory into the exact video, article, or song you cannot name.' },
};

export const viewport = {
  themeColor: '#8b5cf6',
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="antialiased min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
