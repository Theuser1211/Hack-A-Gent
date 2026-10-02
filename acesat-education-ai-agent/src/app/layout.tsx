import './globals.css';

export const metadata = { title: 'Quarry', description: 'Quarry — a reverse search engine that turns a vague memory into the exact video, article, or song you cannot name.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
