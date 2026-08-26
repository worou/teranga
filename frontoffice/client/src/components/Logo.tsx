import { Link } from 'react-router-dom'
import styles from './Logo.module.css'

interface Props {
  size?: number
  light?: boolean
  showTagline?: boolean
  href?: string
}

export function TerangaSymbol({ size = 40, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      {light ? (
        <>
          <path d="M20 38 Q8 32 8 20 Q8 10 18 10 Q27 10 32 20 L32 40 Z" fill="#D49060" stroke="#F5E6D3" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M44 38 Q56 32 56 20 Q56 10 46 10 Q37 10 32 20 L32 40 Z" fill="#B8691A" stroke="#F5E6D3" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M32 40 L32 54 Q32 58 28 54 L18 44 Z" fill="#D49060" stroke="#F5E6D3" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M32 40 L32 54 Q32 58 36 54 L46 44 Z" fill="#B8691A" stroke="#F5E6D3" strokeWidth="1.5" strokeLinejoin="round"/>
          <circle cx="32" cy="28" r="3.5" fill="#F5E6D3"/>
        </>
      ) : (
        <>
          <path d="M20 38 Q8 32 8 20 Q8 10 18 10 Q27 10 32 20 L32 40 Z" fill="#D49060" stroke="#5B2E0C" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M44 38 Q56 32 56 20 Q56 10 46 10 Q37 10 32 20 L32 40 Z" fill="#B8691A" stroke="#5B2E0C" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M32 40 L32 54 Q32 58 28 54 L18 44 Z" fill="#D49060" stroke="#5B2E0C" strokeWidth="2" strokeLinejoin="round"/>
          <path d="M32 40 L32 54 Q32 58 36 54 L46 44 Z" fill="#B8691A" stroke="#5B2E0C" strokeWidth="2" strokeLinejoin="round"/>
          <circle cx="32" cy="28" r="3.5" fill="#FDF8F0" stroke="#5B2E0C" strokeWidth="1.5"/>
        </>
      )}
    </svg>
  )
}

export default function Logo({ size = 40, light = false, showTagline = false, href = '/' }: Props) {
  return (
    <Link to={href} className={styles.logo}>
      <TerangaSymbol size={size} light={light} />
      <span className={`${styles.logoText} ${light ? styles.light : ''}`}>
        <span className={styles.wordmark}>Tér<em>anga</em></span>
        {showTagline && <span className={styles.tagline}>La rencontre, autrement</span>}
      </span>
    </Link>
  )
}
