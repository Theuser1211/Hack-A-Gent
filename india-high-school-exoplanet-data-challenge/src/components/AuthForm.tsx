'use client';

export default function AuthForm({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  return (
    <form onSubmit={e => e.preventDefault()} style={{maxWidth:'400px',margin:'2rem auto',display:'flex',flexDirection:'column',gap:'0.75rem'}}>
      <h2>{mode === 'signin' ? 'Sign In' : 'Create Account'}</h2>
      <input type="email" placeholder="Email" required />
      <input type="password" placeholder="Password" required />
      <button type="submit">{mode === 'signin' ? 'Sign In' : 'Sign Up'}</button>
    </form>
  );
}
