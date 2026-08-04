import './globals.css';

export const metadata = { title: 'Haven', description: 'Haven — a planning agent that stress-tests your roadmap against the ways projects die and patches the top risk first.' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
