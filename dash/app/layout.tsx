import type { ReactNode } from 'react';
import './style.css';
export const metadata = { title: 'm9sweeper Modern', description: 'Local security scan preview' };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
