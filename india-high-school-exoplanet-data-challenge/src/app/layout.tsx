import './globals.css';

export const metadata = { title: 'india-high-school-exoplanet-data-challenge', description: 'Hackathon project' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav style={{background:'#1a1a2e',color:'white',padding:'0.75rem 1.5rem',display:'flex',gap:'1.5rem',alignItems:'center'}}>
          <strong>{'india-high-school-exoplanet-data-challenge'}</strong>
          <a href="/" style={{color:'#a0c4ff',textDecoration:'none'}}>Home</a>
        </nav>
        {children}
        <footer style={{background:'#e9ecef',padding:'1rem',textAlign:'center',marginTop:'2rem',color:'#666',fontSize:'0.85rem'}}>
          Hackathon Project
        </footer>
      </body>
    </html>
  );
}
